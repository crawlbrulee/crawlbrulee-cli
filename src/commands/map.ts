import { Option, type Command } from 'commander'

import { renderMapText } from '../output/render-map.js'
import { parseNonNegativeInt, parsePositiveInt } from '../parsers/integers.js'
import { parseDepth, parseEntries, parseModifiedSince } from '../parsers/map.js'
import { parseProxy } from '../parsers/proxy.js'
import type { CliMapRequest, CliMapResponse } from '../sdk-pending.js'
import { addFormatOptions, runCommand, withErrorHandler, type CommonOptions } from './runner.js'

export interface MapOptions extends CommonOptions {
  maxResults?: string
  maxUrls?: string // the old name of --max-results, hidden from --help
  limit?: string
  page?: string
  sitemapOnly?: boolean
  sitemapUrl?: string
  depth?: string
  entries?: string
  modifiedSince?: string
  internalOnly?: boolean
  externalOnly?: boolean
  subdomains?: boolean // `--no-subdomains` sets this to false

  proxy?: string
  cacheMaxAge?: string
  zeroDataRetention?: boolean
  country?: string
}

/** Shown under `--help` for `map`: mapping a very large site in several calls. */
const MAP_HELP = `
a very large site, in several calls:
  1. list its top sitemap files and every file they list:
       crawlbrulee map https://example.com --depth 1 --entries sitemaps --json
  2. read each link of type sitemap, plus each sitemap_index link that is
     also in .response_meta.truncation.unread_sitemaps (an index this map
     read only in part):
       crawlbrulee map https://example.com --sitemap-url <file>
  the files of an index read whole are already in your list. a listed file
  shows as sitemap until a map opens it, even when it is a sitemap index
  itself; reading it then follows its own files,
  and its own unread_sitemaps (in text output, the lines at the end) are the
  files to read next. a sitemap index holds only sitemap files, so reading
  one at a low --depth with --entries pages (the default) returns no pages:
  use --entries sitemaps or a higher --depth. with --entries all, each line
  is <type> <lastmod> <url>. the full walk-through:
  https://crawlbrulee.com/docs/map/sitemaps#map-a-very-large-or-deep-site-in-several-calls`

export function registerMapCommand(program: Command): void {
  const cmd = program
    .command('map <url>')
    .description('List URLs discovered on a site via the crawlbrulee API')
    .option('-k, --api-key <key>', 'API key (overrides config + env)')
    .option('--api-url <url>', 'Base URL (overrides config + env)')

    .option(
      '--max-results <n>',
      'the most entries to find (default 5000, API max 100000), counting only the kind in --entries; a discovery budget, not a trim at the end: raising it does more work and can turn a free cache hit into a billed fresh map'
    )
    // The old name of --max-results: still works, sends max_results, not in --help.
    .addOption(new Option('--max-urls <n>').hideHelp())
    .option('--limit <n>', 'URLs per page (default 5000, API max 10000)')
    .option('--page <n>', 'page number (1-indexed)')
    .option(
      '--sitemap-url <url>',
      "start from this sitemap file, on the same site or on a host its robots.txt names (default: the site's top sitemap files)"
    )
    .option(
      '--depth <n>',
      "levels of nested sitemaps to follow: 0 to 3 (default 3). 0 without --sitemap-url lists the site's top sitemap files without reading their entries; 1 with --entries sitemaps lists them and every file they list"
    )
    .option('--entries <kind>', 'what to return: pages | sitemaps | all (default pages)')
    .option(
      '--modified-since <date>',
      'only entries whose own lastmod is at or after this date (2026-11-01, or an ISO 8601 date and time with a time zone); every sitemap file is still read; never served from the cache'
    )
    .option('--sitemap-only', 'use the sitemaps only: leave out the links found on the home page')
    .option('--internal-only', 'only same-domain links')
    .option('--external-only', 'only external-domain links')
    .option('--no-subdomains', 'exclude subdomains from internal results')

    .option(
      '--proxy <tier>',
      'proxy tier: basic | advanced | auto (default: auto, which moves to a stronger proxy on its own when a site needs it)'
    )
    .option('--cache-max-age <seconds>', 'cache max age in seconds')
    .option(
      '--zero-data-retention',
      'keeps the result out of the shared cache; anything stored to deliver it is kept for 24 hours, then deleted. adds 1 credit. must be enabled for your organization'
    )
    .option(
      '--country <iso>',
      "ISO 3166-1 alpha-2 country code (e.g. US) — proxy egress hint; 'eu' / 'europe' also accepted"
    )

  addFormatOptions(cmd).addHelpText('after', MAP_HELP).action(withErrorHandler(runMap))
}

export function runMap(url: string, opts: MapOptions): Promise<void> {
  const body = buildMapRequest(url, opts)
  // `--entries all` mixes pages and sitemap files, so each line then says which it is.
  const showTypes = body.entries === 'all'
  return runCommand({
    opts,
    // The sdk floor (1.4) types neither the new map fields nor the ones the answer adds.
    call: async client => (await client.map(body)) as unknown as CliMapResponse,
    renderText: res => renderMapText(res, { showTypes }),
  })
}

export function buildMapRequest(url: string, opts: MapOptions): CliMapRequest {
  if (opts.internalOnly && opts.externalOnly) {
    throw new Error('cannot combine --internal-only and --external-only')
  }

  const body: CliMapRequest = { url }

  const maxResults = parseMaxResults(opts)
  if (maxResults !== undefined) body.max_results = maxResults
  if (opts.limit !== undefined) body.limit = parsePositiveInt(opts.limit, '--limit')
  if (opts.page !== undefined) body.page = parsePositiveInt(opts.page, '--page')
  if (opts.sitemapOnly) body.sitemap_only = true
  if (opts.proxy) body.proxy = parseProxy(opts.proxy)
  if (opts.zeroDataRetention) body.zero_data_retention = true
  if (opts.country) body.location = { country: opts.country }

  if (opts.sitemapUrl !== undefined) {
    if (opts.sitemapUrl.trim() === '') {
      throw new Error('--sitemap-url needs a sitemap file url')
    }
    body.sitemap_url = opts.sitemapUrl
  }
  if (opts.depth !== undefined) body.depth = parseDepth(opts.depth)
  if (opts.entries !== undefined) body.entries = parseEntries(opts.entries)
  if (opts.modifiedSince !== undefined) {
    body.modified_since = parseModifiedSince(opts.modifiedSince)
  }

  if (opts.cacheMaxAge !== undefined) {
    body.cache = { max_age: parseNonNegativeInt(opts.cacheMaxAge, '--cache-max-age') }
  }

  const types: NonNullable<CliMapRequest['types']> = {}
  if (opts.internalOnly) {
    types.internal = true
    types.external = false
    types.internal_subdomains = false
  } else if (opts.externalOnly) {
    types.internal = false
    types.external = true
    types.internal_subdomains = false
  }
  if (opts.subdomains === false) {
    types.internal_subdomains = false
  }
  if (Object.keys(types).length > 0) {
    body.types = types
  }

  return body
}

/**
 * `--max-results`, or its old name `--max-urls`. Both send `max_results`, so
 * the old flag keeps working after the api drops the `max_urls` field.
 */
function parseMaxResults(opts: MapOptions): number | undefined {
  if (opts.maxResults !== undefined && opts.maxUrls !== undefined) {
    throw new Error('--max-urls is the old name of --max-results: give only --max-results')
  }
  if (opts.maxResults !== undefined) {
    return parsePositiveInt(opts.maxResults, '--max-results')
  }
  if (opts.maxUrls !== undefined) {
    return parsePositiveInt(opts.maxUrls, '--max-urls')
  }
  return undefined
}
