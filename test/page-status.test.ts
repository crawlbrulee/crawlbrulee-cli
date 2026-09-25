/**
 * A page the site answered with an error status (a 404, a 410, a 503 …) is
 * still a successful scrape: the api returns it with a 200 and puts the site's
 * status in `page_status_code`. The cli prints it and exits 0. Only a real
 * error from the api (like `target_unreachable`, HTTP 502) exits 1.
 */
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runMap } from '../src/commands/map.js'
import { withErrorHandler } from '../src/commands/runner.js'
import { runScrapeResult, runScrapeUrl, runScrapeWait } from '../src/commands/scrape.js'

const JSON_HEADERS = { 'content-type': 'application/json' }
const AUTH = { apiKey: 'cwbl_test_key', apiUrl: 'https://staging-api.example.com' }

const PAGE_404 = {
  url: 'https://example.com/missing',
  requested_url: 'https://example.com/missing',
  page_status_code: 404,
  content_type: 'text/html',
  markdown: '# Page not found',
  metadata: { title: 'Page not found' },
  response_meta: {
    usage: {
      total_credit_cost: 15,
      engine_credit_cost: 3,
      proxy_multiplier: 5,
      screenshot_slicing_credit_cost: 0,
      engine: 'browser',
      proxy: 'advanced',
      credits: 15,
      screenshot_slices: 0,
    },
  },
  warnings: [],
}

const UNREACHABLE = { name: 'target_unreachable', message: 'Could not reach the target site.' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function stdoutOf(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map(c => String(c[0])).join('')
}

describe('page status and target_unreachable (via mocked fetch)', () => {
  let tempCfg: string
  const ORIG_KEY = process.env.CRAWLBRULEE_API_KEY

  beforeEach(async () => {
    tempCfg = await mkdtemp(join(tmpdir(), 'crawlbrulee-cli-'))
    process.env.XDG_CONFIG_HOME = tempCfg
    delete process.env.CRAWLBRULEE_API_KEY
  })

  afterEach(async () => {
    delete process.env.XDG_CONFIG_HOME
    if (ORIG_KEY === undefined) delete process.env.CRAWLBRULEE_API_KEY
    else process.env.CRAWLBRULEE_API_KEY = ORIG_KEY
    await rm(tempCfg, { recursive: true, force: true })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('a 404 page is a successful scrape', () => {
    it('scrape url prints the page and the page status in text mode', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(PAGE_404))
      )
      const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

      await runScrapeUrl('https://example.com/missing', { ...AUTH, text: true })

      const out = stdoutOf(writeSpy)
      expect(out).toContain('# Page not found')
      expect(out).toContain(
        '# usage: 15 credits · engine browser · proxy advanced · slices 0 · page status 404'
      )
    })

    it('scrape url passes the response through unchanged in json mode', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(PAGE_404))
      )
      const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

      await runScrapeUrl('https://example.com/missing', { ...AUTH, json: true })

      expect(JSON.parse(stdoutOf(writeSpy))).toEqual(PAGE_404)
    })

    it('exits 0: the error handler never calls process.exit', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(PAGE_404))
      )
      vi.spyOn(process.stdout, 'write').mockReturnValue(true)
      const errSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

      await withErrorHandler(runScrapeUrl)('https://example.com/missing', { ...AUTH, text: true })

      expect(exitSpy).not.toHaveBeenCalled()
      expect(stdoutOf(errSpy)).toBe('')
    })

    it('scrape result shows the page status the same way', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(PAGE_404))
      )
      const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

      await runScrapeResult('job_404', { ...AUTH, text: true })

      expect(stdoutOf(writeSpy)).toContain('· page status 404')
    })

    it('scrape wait shows the page status the same way', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string | URL) =>
          String(url).includes('/api/scrape/status/')
            ? jsonResponse({
                job_id: 'job_404',
                status: 'done',
                created_at: '2026-09-25T10:00:00Z',
              })
            : jsonResponse(PAGE_404)
        )
      )
      const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
      vi.spyOn(process.stderr, 'write').mockReturnValue(true)

      await runScrapeWait('job_404', { ...AUTH, text: true })

      expect(stdoutOf(writeSpy)).toContain('· page status 404')
    })

    it('an older api response without page_status_code renders as before', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse({
            url: 'https://example.com',
            requested_url: 'https://example.com',
            markdown: '# hi',
            response_meta: {
              usage: { credits: 1, engine: 'http', proxy: 'basic', screenshot_slices: 0 },
            },
          })
        )
      )
      const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

      await runScrapeUrl('https://example.com', { ...AUTH, text: true })

      const out = stdoutOf(writeSpy)
      expect(out).toContain('# usage: 1 credits · engine http · proxy basic · slices 0')
      expect(out).not.toContain('page status')
    })
  })

  describe('target_unreachable (HTTP 502) is an error', () => {
    it('scrape url rejects with the error name and status', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(UNREACHABLE, 502))
      )

      await expect(
        runScrapeUrl('https://unreachable.example', { ...AUTH, json: true })
      ).rejects.toMatchObject({ errorName: 'target_unreachable', status: 502 })
    })

    it('prints a clear message to stderr and exits 1, like other target-side errors', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(UNREACHABLE, 502))
      )
      const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
      const errSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

      await withErrorHandler(runScrapeUrl)('https://unreachable.example', { ...AUTH, text: true })

      expect(stdoutOf(errSpy)).toBe(
        'error: target_unreachable — Could not reach the target site. (retrying later may help)\n'
      )
      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(writeSpy).not.toHaveBeenCalled()
    })

    it('antibot_blocked exits 1 the same way', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse(
            { name: 'antibot_blocked', message: 'The target site blocked the request.' },
            403
          )
        )
      )
      vi.spyOn(process.stdout, 'write').mockReturnValue(true)
      vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

      await withErrorHandler(runScrapeUrl)('https://example.com', { ...AUTH, text: true })

      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('map prints the same message and exits 1', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(UNREACHABLE, 502))
      )
      const errSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

      await withErrorHandler(runMap)('https://unreachable.example', { ...AUTH, text: true })

      expect(stdoutOf(errSpy)).toContain(
        'error: target_unreachable — Could not reach the target site.'
      )
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })
})
