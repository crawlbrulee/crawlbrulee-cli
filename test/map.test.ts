import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildMapRequest, runMap } from '../src/commands/map.js'
import { renderMapText } from '../src/output/render-map.js'
import type { CliMapResponse } from '../src/sdk-pending.js'

describe('buildMapRequest — basic', () => {
  it('returns just the URL when no flags are given', () => {
    expect(buildMapRequest('https://example.com', {})).toEqual({ url: 'https://example.com' })
  })

  it('passes --limit and --page through as integers', () => {
    expect(buildMapRequest('https://example.com', { limit: '500', page: '2' })).toEqual({
      url: 'https://example.com',
      limit: 500,
      page: 2,
    })
  })

  it('rejects non-positive --limit', () => {
    expect(() => buildMapRequest('https://example.com', { limit: '0' })).toThrow(
      /invalid --limit '0'/
    )
  })

  it('passes --max-results through as an integer', () => {
    expect(buildMapRequest('https://example.com', { maxResults: '20000' })).toEqual({
      url: 'https://example.com',
      max_results: 20000,
    })
  })

  // max_results is a server-side default (5000), so an absent flag must not send the key at
  // all — sending our own guess would freeze the default into every CLI call.
  it('omits max_results entirely when --max-results is not given', () => {
    expect(buildMapRequest('https://example.com', { limit: '500' })).not.toHaveProperty(
      'max_results'
    )
  })

  it('rejects non-positive --max-results', () => {
    expect(() => buildMapRequest('https://example.com', { maxResults: '0' })).toThrow(
      /invalid --max-results '0'/
    )
  })

  it('rejects a non-numeric --max-results', () => {
    expect(() => buildMapRequest('https://example.com', { maxResults: 'lots' })).toThrow(
      /invalid --max-results 'lots'/
    )
  })

  it('--max-urls, the old name, still works and sends max_results', () => {
    const body = buildMapRequest('https://example.com', { maxUrls: '300' })
    expect(body).toEqual({ url: 'https://example.com', max_results: 300 })
    expect(body).not.toHaveProperty('max_urls')
  })

  it('rejects a non-positive --max-urls by its own name', () => {
    expect(() => buildMapRequest('https://example.com', { maxUrls: '0' })).toThrow(
      /invalid --max-urls '0'/
    )
  })

  it('refuses --max-urls together with --max-results', () => {
    expect(() =>
      buildMapRequest('https://example.com', { maxUrls: '300', maxResults: '50' })
    ).toThrow('--max-urls is the old name of --max-results: give only --max-results')
  })

  it('--sitemap-only sets sitemap_only=true', () => {
    const body = buildMapRequest('https://example.com', { sitemapOnly: true })
    expect(body.sitemap_only).toBe(true)
  })
})

describe('buildMapRequest — types filtering', () => {
  it('--internal-only collapses to internal=true, others=false', () => {
    const body = buildMapRequest('https://example.com', { internalOnly: true })
    expect(body.types).toEqual({
      internal: true,
      external: false,
      internal_subdomains: false,
    })
  })

  it('--external-only collapses to external=true, others=false', () => {
    const body = buildMapRequest('https://example.com', { externalOnly: true })
    expect(body.types).toEqual({
      internal: false,
      external: true,
      internal_subdomains: false,
    })
  })

  it('--no-subdomains sets internal_subdomains=false alone', () => {
    const body = buildMapRequest('https://example.com', { subdomains: false })
    expect(body.types).toEqual({ internal_subdomains: false })
  })

  it('--internal-only + --no-subdomains is redundant but accepted', () => {
    const body = buildMapRequest('https://example.com', {
      internalOnly: true,
      subdomains: false,
    })
    expect(body.types).toEqual({
      internal: true,
      external: false,
      internal_subdomains: false,
    })
  })

  it('rejects --internal-only + --external-only as ambiguous', () => {
    expect(() =>
      buildMapRequest('https://example.com', { internalOnly: true, externalOnly: true })
    ).toThrow(/cannot combine --internal-only and --external-only/)
  })
})

describe('buildMapRequest — proxy / cache / country', () => {
  it('--proxy advanced sends proxy=advanced', () => {
    expect(buildMapRequest('https://example.com', { proxy: 'advanced' }).proxy).toBe('advanced')
  })

  it('--proxy with an unknown tier throws', () => {
    expect(() => buildMapRequest('https://example.com', { proxy: 'garbage' })).toThrow(
      /invalid --proxy 'garbage'/
    )
  })

  it('--cache-max-age sets cache.max_age', () => {
    expect(buildMapRequest('https://example.com', { cacheMaxAge: '604800' }).cache).toEqual({
      max_age: 604800,
    })
  })

  it('--country populates location.country', () => {
    expect(buildMapRequest('https://example.com', { country: 'DE' }).location).toEqual({
      country: 'DE',
    })
  })
})

describe('runMap (end-to-end via mocked fetch)', () => {
  let tempCfg: string

  beforeEach(async () => {
    tempCfg = await mkdtemp(join(tmpdir(), 'crawlbrulee-cli-'))
    process.env.XDG_CONFIG_HOME = tempCfg
    delete process.env.CRAWLBRULEE_API_KEY
  })

  afterEach(async () => {
    delete process.env.XDG_CONFIG_HOME
    delete process.env.CRAWLBRULEE_API_KEY
    await rm(tempCfg, { recursive: true, force: true })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('POSTs to /api/map with the right body and Bearer token', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            links: [{ url: 'https://example.com/a' }],
            response_meta: {
              pagination: { page: 1, limit: 10, total: 1, total_pages: 1, has_more: false },
              truncation: {
                storage_capped: false,
                response_capped: false,
                total_before_max_urls: 1,
                total_detected_before_storage_cap: 1,
                discovery_capped: false,
                sitemaps_skipped: 0,
                discovery_cap_reason: null,
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await runMap('https://example.com', {
      apiKey: 'cwbl_test',
      apiUrl: 'https://staging-api.example.com',
      maxResults: '20000',
      limit: '10',
      country: 'DE',
      json: true,
    })

    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(calledUrl).toBe('https://staging-api.example.com/api/map')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer cwbl_test')
    const parsedBody: unknown = JSON.parse(init.body as string)
    expect(parsedBody).toEqual({
      url: 'https://example.com',
      max_results: 20000,
      limit: 10,
      location: { country: 'DE' },
    })
    expect(writeSpy).toHaveBeenCalled()
  })
})

describe('buildMapRequest — zero data retention', () => {
  it('--zero-data-retention sets zero_data_retention', () => {
    expect(
      buildMapRequest('https://example.com', { zeroDataRetention: true }).zero_data_retention
    ).toBe(true)
  })

  it('leaves the field out when the flag is not given', () => {
    expect(buildMapRequest('https://example.com', {})).not.toHaveProperty('zero_data_retention')
  })
})

describe('buildMapRequest — sitemap_url, depth, entries, modified_since', () => {
  it('sends none of them when no flag is given', () => {
    const body = buildMapRequest('https://example.com', {})
    for (const field of ['sitemap_url', 'depth', 'entries', 'modified_since']) {
      expect(body).not.toHaveProperty(field)
    }
  })

  it('passes each flag through under the api name', () => {
    expect(
      buildMapRequest('https://example.com', {
        sitemapUrl: 'https://cdn.example.com/sitemaps/products-1.xml.gz',
        depth: '1',
        entries: 'all',
        modifiedSince: '2026-11-01T08:30:00+01:00',
      })
    ).toEqual({
      url: 'https://example.com',
      sitemap_url: 'https://cdn.example.com/sitemaps/products-1.xml.gz',
      depth: 1,
      entries: 'all',
      modified_since: '2026-11-01T08:30:00+01:00',
    })
  })

  it('--depth 0 --entries sitemaps asks for the top sitemap files', () => {
    expect(buildMapRequest('https://example.com', { depth: '0', entries: 'sitemaps' })).toEqual({
      url: 'https://example.com',
      depth: 0,
      entries: 'sitemaps',
    })
  })

  it('leaves the depth maximum to the api', () => {
    expect(buildMapRequest('https://example.com', { depth: '9' }).depth).toBe(9)
  })

  it.each([['-1'], ['1.5'], ['two'], ['']])('refuses --depth %j', raw => {
    expect(() => buildMapRequest('https://example.com', { depth: raw })).toThrow(
      /invalid --depth .* \(must be a whole number, 0 or more\)/
    )
  })

  it('reads --entries in any case', () => {
    expect(buildMapRequest('https://example.com', { entries: 'Sitemaps' }).entries).toBe('sitemaps')
  })

  it('refuses an unknown --entries value', () => {
    expect(() => buildMapRequest('https://example.com', { entries: 'images' })).toThrow(
      /invalid --entries 'images' \(expected one of: pages, sitemaps, all\)/
    )
  })

  it('refuses an empty --sitemap-url', () => {
    expect(() => buildMapRequest('https://example.com', { sitemapUrl: ' ' })).toThrow(
      '--sitemap-url needs a sitemap file url'
    )
  })

  it('a plain --modified-since date means the start of that day in UTC', () => {
    const body = buildMapRequest('https://example.com', { modifiedSince: '2026-11-01' })
    expect(body.modified_since).toBe('2026-11-01T00:00:00Z')
  })

  it.each([['last week'], ['2026-11-01T08:00:00'], ['2026-11-01T08:00Z'], ['01/11/2026']])(
    'refuses --modified-since %j',
    raw => {
      expect(() => buildMapRequest('https://example.com', { modifiedSince: raw })).toThrow(
        /invalid --modified-since/
      )
    }
  )
})

describe('renderMapText', () => {
  const mapResponse = (): CliMapResponse => ({
    links: [
      {
        url: 'https://example.com/sitemaps/products-1.xml.gz',
        type: 'sitemap',
        lastmod: '2026-11-01T00:00:00.000Z',
      },
      { url: 'https://example.com/books/the-night-garden', type: 'page', lastmod: null },
    ],
    response_meta: {
      pagination: { page: 1, limit: 5000, total: 2, total_pages: 1, has_more: false },
      truncation: {
        storage_capped: false,
        response_capped: false,
        total_before_max_results: 2,
        total_before_max_urls: 2,
        total_detected_before_storage_cap: 2,
        discovery_capped: true,
        sitemaps_skipped: 1,
        unread_sitemaps: ['https://example.com/sitemaps/products-2.xml.gz'],
        discovery_cap_reason: 'depth',
      },
      usage: { total_credit_cost: 1, engine: 'http', proxy: 'basic' },
    },
  })

  it('prints plain urls by default, then the unread sitemap files', () => {
    expect(renderMapText(mapResponse())).toBe(
      [
        'https://example.com/sitemaps/products-1.xml.gz',
        'https://example.com/books/the-night-garden',
        '',
        '# 1 sitemap files not read (read each with --sitemap-url <url>):',
        '#   https://example.com/sitemaps/products-2.xml.gz',
        '# usage: 1 credits · engine http · proxy basic',
      ].join('\n')
    )
  })

  it('shows type and lastmod on each line with showTypes', () => {
    const out = renderMapText(mapResponse(), { showTypes: true })
    expect(out.split('\n').slice(0, 2)).toEqual([
      'sitemap       2026-11-01T00:00:00.000Z https://example.com/sitemaps/products-1.xml.gz',
      'page          -                        https://example.com/books/the-night-garden',
    ])
  })

  it('fits sitemap_index in the type column, so the urls stay in line', () => {
    const res = mapResponse()
    res.links.unshift({
      url: 'https://example.com/sitemap_index.xml',
      type: 'sitemap_index',
      lastmod: null,
    })
    const lines = renderMapText(res, { showTypes: true }).split('\n').slice(0, 3)
    expect(lines[0]).toBe(
      'sitemap_index -                        https://example.com/sitemap_index.xml'
    )
    // every url starts in the same column
    expect(new Set(lines.map(line => line.indexOf('https://')))).toEqual(new Set([39]))
  })

  it('prints no unread block when every file was read', () => {
    const res = mapResponse()
    res.response_meta.truncation.unread_sitemaps = []
    res.links = [{ url: 'https://example.com/a', type: 'page', lastmod: null }]
    expect(renderMapText(res)).toBe(
      'https://example.com/a\n\n# usage: 1 credits · engine http · proxy basic'
    )
  })

  it('lists unread sitemap files after the pagination hint', () => {
    const res = mapResponse()
    res.response_meta.pagination = { page: 1, limit: 2, total: 5, total_pages: 3, has_more: true }
    const out = renderMapText(res)
    expect(out).toContain(
      '# … and 3 more (use --page 2)\n# 1 sitemap files not read (read each with --sitemap-url <url>):'
    )
  })

  it('works with an older api that sends no type, lastmod or unread_sitemaps', () => {
    const old = {
      links: [{ url: 'https://example.com/a' }],
      response_meta: {
        pagination: { page: 1, limit: 5000, total: 1, total_pages: 1, has_more: false },
        truncation: { discovery_cap_reason: null },
      },
    } as unknown as CliMapResponse
    expect(renderMapText(old, { showTypes: true })).toBe(
      '-             -                        https://example.com/a'
    )
  })
})

describe('runMap — the new map fields on the wire', () => {
  let tempCfg: string

  beforeEach(async () => {
    tempCfg = await mkdtemp(join(tmpdir(), 'crawlbrulee-cli-'))
    process.env.XDG_CONFIG_HOME = tempCfg
    delete process.env.CRAWLBRULEE_API_KEY
  })

  afterEach(async () => {
    delete process.env.XDG_CONFIG_HOME
    await rm(tempCfg, { recursive: true, force: true })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const answer = {
    links: [
      { url: 'https://example.com/a', type: 'page', lastmod: '2026-11-03T09:12:00.000Z' },
      { url: 'https://example.com/sitemap-blog.xml', type: 'sitemap', lastmod: null },
    ],
    response_meta: {
      pagination: { page: 1, limit: 5000, total: 2, total_pages: 1, has_more: false },
      truncation: {
        storage_capped: false,
        response_capped: false,
        total_before_max_results: 2,
        total_before_max_urls: 2,
        total_detected_before_storage_cap: 2,
        discovery_capped: false,
        sitemaps_skipped: 0,
        unread_sitemaps: [],
        discovery_cap_reason: null,
      },
      usage: { total_credit_cost: 1, engine: 'http', proxy: 'basic' },
    },
  }

  function stubFetch() {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(answer), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    return { fetchMock, writeSpy }
  }

  it('sends the fields and passes the answer through in json', async () => {
    const { fetchMock, writeSpy } = stubFetch()

    await runMap('https://example.com', {
      apiKey: 'cwbl_test',
      sitemapUrl: 'https://example.com/sitemap.xml',
      entries: 'all',
      maxUrls: '100',
      json: true,
    })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      url: 'https://example.com',
      sitemap_url: 'https://example.com/sitemap.xml',
      entries: 'all',
      max_results: 100,
    })
    expect(JSON.parse(String(writeSpy.mock.calls[0]?.[0]))).toEqual(answer)
  })

  it('shows type and lastmod in text for --entries all', async () => {
    const { writeSpy } = stubFetch()

    await runMap('https://example.com', { apiKey: 'cwbl_test', entries: 'all', text: true })

    expect(String(writeSpy.mock.calls[0]?.[0])).toMatch(
      /^page {10}2026-11-03T09:12:00\.000Z https:\/\/example\.com\/a\nsitemap {7}- {24}https:\/\/example\.com\/sitemap-blog\.xml\n/
    )
  })

  it('prints plain urls in text for any other --entries', async () => {
    const { writeSpy } = stubFetch()

    await runMap('https://example.com', { apiKey: 'cwbl_test', entries: 'sitemaps', text: true })

    expect(String(writeSpy.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/example\.com\/a\nhttps:\/\/example\.com\/sitemap-blog\.xml\n/
    )
  })
})
