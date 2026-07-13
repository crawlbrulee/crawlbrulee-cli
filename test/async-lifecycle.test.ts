import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  resolveWaitParams,
  runScrapeResult,
  runScrapeStatus,
  runScrapeUrl,
  runScrapeWait,
} from '../src/commands/scrape.js'

const JSON_HEADERS = { 'content-type': 'application/json' }
const AUTH = { apiKey: 'cwbl_test_key', apiUrl: 'https://staging-api.example.com' }

describe('resolveWaitParams', () => {
  it('returns an empty object when neither flag is given', () => {
    expect(resolveWaitParams({})).toEqual({})
  })

  it('converts --interval seconds to intervalMs', () => {
    expect(resolveWaitParams({ interval: '2' })).toEqual({ intervalMs: 2000 })
  })

  it('converts --timeout seconds to timeoutMs and allows 0 (wait forever)', () => {
    expect(resolveWaitParams({ timeout: '0' })).toEqual({ timeoutMs: 0 })
  })

  it('rejects a non-positive --interval', () => {
    expect(() => resolveWaitParams({ interval: '0' })).toThrow(/invalid --interval/)
  })
})

describe('async lifecycle run functions (via mocked fetch)', () => {
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

  it('runScrapeStatus GETs /api/scrape/status/:id and renders the status', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ jobId: 'job_1', status: 'running', createdAt: '2026-07-13T10:00:00Z' }),
          { status: 200, headers: JSON_HEADERS }
        )
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await runScrapeStatus('job_1', { ...AUTH, text: true })

    const [calledUrl] = fetchMock.mock.calls[0] as unknown as [string]
    expect(calledUrl).toBe('https://staging-api.example.com/api/scrape/status/job_1')
    const out = writeSpy.mock.calls.map(c => String(c[0])).join('')
    expect(out).toContain('status: running')
    expect(out).toContain('job_id: job_1')
  })

  it('runScrapeResult GETs /api/scrape/result/:id and renders the scrape', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ url: 'https://example.com', markdown: '# done' }), {
          status: 200,
          headers: JSON_HEADERS,
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await runScrapeResult('job_2', { ...AUTH, text: true })

    const [calledUrl] = fetchMock.mock.calls[0] as unknown as [string]
    expect(calledUrl).toBe('https://staging-api.example.com/api/scrape/result/job_2')
    const out = writeSpy.mock.calls.map(c => String(c[0])).join('')
    expect(out).toContain('# done')
  })

  it('runScrapeWait polls status then fetches the result', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('/api/scrape/status/')) {
        return new Response(
          JSON.stringify({ jobId: 'job_3', status: 'done', createdAt: '2026-07-13T10:00:00Z' }),
          { status: 200, headers: JSON_HEADERS }
        )
      }
      return new Response(JSON.stringify({ url: 'https://example.com', markdown: '# waited' }), {
        status: 200,
        headers: JSON_HEADERS,
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await runScrapeWait('job_3', { ...AUTH, json: true })

    const urls = fetchMock.mock.calls.map(c => String(c[0]))
    expect(urls.some(u => u.includes('/api/scrape/status/job_3'))).toBe(true)
    expect(urls.some(u => u.includes('/api/scrape/result/job_3'))).toBe(true)
    const out = writeSpy.mock.calls.map(c => String(c[0])).join('')
    expect(JSON.parse(out)).toMatchObject({ markdown: '# waited' })
  })

  it('runScrapeWait prints a single stderr note in text mode', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('/api/scrape/status/')) {
        return new Response(
          JSON.stringify({ jobId: 'job_4', status: 'done', createdAt: '2026-07-13T10:00:00Z' }),
          { status: 200, headers: JSON_HEADERS }
        )
      }
      return new Response(JSON.stringify({ url: 'https://example.com', markdown: 'x' }), {
        status: 200,
        headers: JSON_HEADERS,
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const errSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    await runScrapeWait('job_4', { ...AUTH, text: true })

    const err = errSpy.mock.calls.map(c => String(c[0])).join('')
    expect(err).toContain('waiting for job job_4')
  })

  it('runScrapeWait stays silent on stderr in json mode', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('/api/scrape/status/')) {
        return new Response(
          JSON.stringify({ jobId: 'job_5', status: 'done', createdAt: '2026-07-13T10:00:00Z' }),
          { status: 200, headers: JSON_HEADERS }
        )
      }
      return new Response(JSON.stringify({ url: 'https://example.com', markdown: 'x' }), {
        status: 200,
        headers: JSON_HEADERS,
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const errSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    await runScrapeWait('job_5', { ...AUTH, json: true })

    const err = errSpy.mock.calls.map(c => String(c[0])).join('')
    expect(err).not.toContain('waiting for job')
  })
})

describe('runScrapeUrl — --wait dispatch + validation', () => {
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

  it('--wait without --async errors and makes no request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runScrapeUrl('https://example.com', { ...AUTH, wait: true })).rejects.toThrow(
      /--wait requires --async/
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('--interval without --wait errors', async () => {
    await expect(
      runScrapeUrl('https://example.com', { ...AUTH, async: true, interval: '2' })
    ).rejects.toThrow(/--interval and --timeout require --wait/)
  })

  it('--async --wait submits then polls then prints the result', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/api/scrape/async') && init?.method === 'POST') {
        return new Response(JSON.stringify({ job_id: 'job_w' }), {
          status: 200,
          headers: JSON_HEADERS,
        })
      }
      if (u.includes('/api/scrape/status/')) {
        return new Response(
          JSON.stringify({ jobId: 'job_w', status: 'done', createdAt: '2026-07-13T10:00:00Z' }),
          { status: 200, headers: JSON_HEADERS }
        )
      }
      return new Response(JSON.stringify({ url: 'https://example.com', markdown: '# fin' }), {
        status: 200,
        headers: JSON_HEADERS,
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await runScrapeUrl('https://example.com', { ...AUTH, async: true, wait: true, json: true })

    const urls = fetchMock.mock.calls.map(c => String(c[0]))
    expect(urls.some(u => u.endsWith('/api/scrape/async'))).toBe(true)
    expect(urls.some(u => u.includes('/api/scrape/result/job_w'))).toBe(true)
    const out = writeSpy.mock.calls.map(c => String(c[0])).join('')
    expect(JSON.parse(out)).toMatchObject({ markdown: '# fin' })
  })
})
