import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildMapRequest, runMap } from '../src/commands/map.js'

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
            meta: {
              pagination: { page: 1, limit: 10, total: 1, total_pages: 1, has_more: false },
              truncation: {
                storage_capped: false,
                response_capped: false,
                total_before_max_urls: 1,
                total_detected_before_storage_cap: 1,
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await runMap('https://example.com', {
      apiKey: 'cble_test',
      apiUrl: 'https://staging-api.example.com',
      limit: '10',
      country: 'DE',
      json: true,
    })

    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(calledUrl).toBe('https://staging-api.example.com/api/map')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer cble_test')
    const parsedBody: unknown = JSON.parse(init.body as string)
    expect(parsedBody).toEqual({
      url: 'https://example.com',
      limit: 10,
      location: { country: 'DE' },
    })
    expect(writeSpy).toHaveBeenCalled()
  })
})
