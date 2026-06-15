import type { MapRequest } from '@crawlbrulee/sdk'
import type { Command } from 'commander'

import { renderMapText } from '../output/render-map.js'
import { parseNonNegativeInt, parsePositiveInt } from '../parsers/integers.js'
import { parseProxy } from '../parsers/proxy.js'
import { addFormatOptions, runCommand, withErrorHandler, type CommonOptions } from './runner.js'

export interface MapOptions extends CommonOptions {
  limit?: string
  page?: string
  sitemapOnly?: boolean
  internalOnly?: boolean
  externalOnly?: boolean
  subdomains?: boolean // `--no-subdomains` sets this to false

  proxy?: string
  cacheMaxAge?: string
  country?: string
}

export function registerMapCommand(program: Command): void {
  const cmd = program
    .command('map <url>')
    .description('List URLs discovered on a site via the crawlbrulee API')
    .option('-k, --api-key <key>', 'API key (overrides config + env)')
    .option('--api-url <url>', 'Base URL (overrides config + env)')

    .option('--limit <n>', 'URLs per page (API max 10000)')
    .option('--page <n>', 'page number (1-indexed)')
    .option('--sitemap-only', 'skip homepage extraction, use sitemap.xml only')
    .option('--internal-only', 'only same-domain links')
    .option('--external-only', 'only external-domain links')
    .option('--no-subdomains', 'exclude subdomains from internal results')

    .option('--proxy <tier>', 'proxy tier: basic | advanced | auto | none')
    .option('--cache-max-age <seconds>', 'cache max age in seconds')
    .option(
      '--country <iso>',
      "ISO 3166-1 alpha-2 country code (e.g. US) — proxy egress hint; 'eu' / 'europe' also accepted"
    )

  addFormatOptions(cmd).action(withErrorHandler(runMap))
}

export function runMap(url: string, opts: MapOptions): Promise<void> {
  const body = buildMapRequest(url, opts)
  return runCommand({
    opts,
    call: client => client.map(body),
    renderText: renderMapText,
  })
}

export function buildMapRequest(url: string, opts: MapOptions): MapRequest {
  if (opts.internalOnly && opts.externalOnly) {
    throw new Error('cannot combine --internal-only and --external-only')
  }

  const body: MapRequest = { url }

  if (opts.limit !== undefined) body.limit = parsePositiveInt(opts.limit, '--limit')
  if (opts.page !== undefined) body.page = parsePositiveInt(opts.page, '--page')
  if (opts.sitemapOnly) body.sitemap_only = true
  if (opts.proxy) body.proxy = parseProxy(opts.proxy)
  if (opts.country) body.location = { country: opts.country }

  if (opts.cacheMaxAge !== undefined) {
    body.cache = { max_age: parseNonNegativeInt(opts.cacheMaxAge, '--cache-max-age') }
  }

  const types: NonNullable<MapRequest['types']> = {}
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
