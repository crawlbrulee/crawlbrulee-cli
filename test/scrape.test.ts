import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildScrapeRequest, runScrape } from '../src/commands/scrape.js'

describe('buildScrapeRequest — default extract resolution', () => {
  it('defaults to markdown + metadata when no extract flag is given', () => {
    const body = buildScrapeRequest('https://example.com', {})
    expect(body.extract).toEqual({ metadata: true, markdown: true })
  })

  it('strips metadata when --no-metadata is set (commander sets metadata=false)', () => {
    const body = buildScrapeRequest('https://example.com', { metadata: false })
    expect(body.extract?.metadata).toBe(false)
    expect(body.extract?.markdown).toBe(true)
  })
})

describe('buildScrapeRequest — single-flag replaces defaults', () => {
  it('with -c only, sends cleaned_html + metadata (no markdown)', () => {
    const body = buildScrapeRequest('https://example.com', { cleanedHtml: true })
    expect(body.extract).toEqual({ metadata: true, cleaned_html: true })
  })

  it('combining -m -l -i sends all three plus metadata', () => {
    const body = buildScrapeRequest('https://example.com', {
      markdown: true,
      links: true,
      images: true,
    })
    expect(body.extract).toEqual({
      metadata: true,
      markdown: true,
      links: true,
      images: true,
    })
  })

  it('a bare --screenshot replaces markdown default with screenshot-only', () => {
    const body = buildScrapeRequest('https://example.com', { screenshot: true })
    expect(body.extract?.markdown).toBeUndefined()
    expect(body.extract?.screenshot).toEqual({ type: 'full_page' })
  })

  it('a --screenshot with mode value is parsed via the -ss parser', () => {
    const body = buildScrapeRequest('https://example.com', { screenshot: 'viewport' })
    expect(body.extract?.screenshot).toEqual({ type: 'viewport' })
  })
})

describe('buildScrapeRequest — --all', () => {
  it('turns on every extract field plus a default full_page screenshot', () => {
    const body = buildScrapeRequest('https://example.com', { all: true })
    expect(body.extract).toEqual({
      metadata: true,
      markdown: true,
      cleaned_html: true,
      raw_html: true,
      links: true,
      images: true,
      screenshot: { type: 'full_page' },
    })
  })

  it('--all --no-metadata strips metadata but keeps the rest', () => {
    const body = buildScrapeRequest('https://example.com', { all: true, metadata: false })
    expect(body.extract?.metadata).toBe(false)
    expect(body.extract?.markdown).toBe(true)
    expect(body.extract?.screenshot).toBeDefined()
  })

  it('--all honors an explicit -ss value over the default full_page', () => {
    const body = buildScrapeRequest('https://example.com', {
      all: true,
      screenshot: 'viewport,1920,1080,mobile',
    })
    expect(body.extract?.screenshot).toEqual({
      type: 'viewport',
      viewport: { width: 1920, height: 1080 },
      device_mode: 'mobile',
    })
  })
})

describe('buildScrapeRequest — transport flags', () => {
  it('--proxy advanced sends proxy=advanced', () => {
    const body = buildScrapeRequest('https://example.com', { proxy: 'advanced' })
    expect(body.proxy).toBe('advanced')
  })

  it('--require-js sends require_js=true', () => {
    const body = buildScrapeRequest('https://example.com', { requireJs: true })
    expect(body.require_js).toBe(true)
  })

  it('--exclude-selectors "nav,footer" sends an array', () => {
    const body = buildScrapeRequest('https://example.com', { excludeSelectors: 'nav, footer' })
    expect(body.exclude_selectors).toEqual(['nav', 'footer'])
  })

  it('--cache-max-age sets cache.max_age', () => {
    const body = buildScrapeRequest('https://example.com', { cacheMaxAge: '86400' })
    expect(body.cache).toEqual({ max_age: 86400 })
  })

  it('--cache-max-age with invalid value throws', () => {
    expect(() => buildScrapeRequest('https://example.com', { cacheMaxAge: 'abc' })).toThrow(
      /invalid --cache-max-age 'abc'/
    )
  })
})

describe('buildScrapeRequest — location', () => {
  it('--locale alone sets location.locale only', () => {
    const body = buildScrapeRequest('https://example.com', { locale: 'en-US' })
    expect(body.location).toEqual({ locale: 'en-US' })
  })

  it('--country alone sets location.country only', () => {
    const body = buildScrapeRequest('https://example.com', { country: 'DE' })
    expect(body.location).toEqual({ country: 'DE' })
  })

  it('both flags merge into one location block', () => {
    const body = buildScrapeRequest('https://example.com', { locale: 'pt-BR', country: 'BR' })
    expect(body.location).toEqual({ locale: 'pt-BR', country: 'BR' })
  })

  it('neither flag → no location key at all', () => {
    const body = buildScrapeRequest('https://example.com', {})
    expect(body.location).toBeUndefined()
  })
})

describe('runScrape (end-to-end via mocked fetch)', () => {
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

  it('sends a Bearer token and the right body to /api/scrape', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ url: 'https://example.com', markdown: '# hi' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await runScrape('https://example.com', {
      apiKey: 'cble_test_key',
      apiUrl: 'https://staging-api.example.com',
      json: true,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(calledUrl).toBe('https://staging-api.example.com/api/scrape')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer cble_test_key')
    const parsedBody: unknown = JSON.parse(init.body as string)
    expect(parsedBody).toEqual({
      url: 'https://example.com',
      extract: { metadata: true, markdown: true },
    })
    expect(writeSpy).toHaveBeenCalled()
  })

  it('surfaces a typed SDK error for 4xx responses', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ name: 'invalid_url', message: 'not a valid URL' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      runScrape('file:///etc/passwd', {
        apiKey: 'cble_test_key',
        apiUrl: 'https://staging-api.example.com',
        json: true,
      })
    ).rejects.toMatchObject({ name: 'ValidationError', errorName: 'invalid_url', status: 400 })
  })

  it('writes to a file when -o is given (and emits JSON since file is not a TTY)', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ url: 'https://example.com', markdown: '# hi' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    const outPath = join(tempCfg, 'out.json')
    await runScrape('https://example.com', {
      apiKey: 'cble_test_key',
      apiUrl: 'https://staging-api.example.com',
      output: outPath,
    })

    const { readFile } = await import('fs/promises')
    const written = await readFile(outPath, 'utf8')
    const parsed: unknown = JSON.parse(written)
    expect(parsed).toMatchObject({ url: 'https://example.com', markdown: '# hi' })
  })

  it('throws MissingAuthError when no key is reachable', async () => {
    await expect(
      runScrape('https://example.com', { apiUrl: 'https://staging.example.com' })
    ).rejects.toThrow(/not logged in/)
  })
})
