import type { ScrapeRequest } from '@crawlbrulee/sdk'
import type { Command } from 'commander'

import { renderScrapeText } from '../output/render-scrape.js'
import { parseNonNegativeInt } from '../parsers/integers.js'
import { parseProxy } from '../parsers/proxy.js'
import { parseScreenshotFlag } from '../parsers/screenshot.js'
import { addFormatOptions, runCommand, withErrorHandler, type CommonOptions } from './runner.js'

export interface ScrapeOptions extends CommonOptions {
  markdown?: boolean
  cleanedHtml?: boolean
  rawHtml?: boolean
  links?: boolean
  images?: boolean
  screenshot?: string | boolean
  all?: boolean
  metadata?: boolean // `--no-metadata` sets this to false

  proxy?: string
  requireJs?: boolean
  excludeSelectors?: string
  cacheMaxAge?: string

  locale?: string
  country?: string
}

export function registerScrapeCommand(program: Command): void {
  const cmd = program
    .command('scrape <url>')
    .description('Scrape a URL via the crawlbrulee API')
    .option('-k, --api-key <key>', 'API key (overrides config + env)')
    .option('--api-url <url>', 'Base URL (overrides config + env)')

    .option('-m, --markdown', 'extract markdown')
    .option('-c, --cleaned-html', 'extract cleaned HTML (main content)')
    .option('-r, --raw-html', 'extract raw HTML')
    .option('-l, --links', 'extract links')
    .option('-i, --images', 'extract inline images')
    // commander 13 rejects multi-char shorts; -ss is rewritten to --screenshot
    // in src/index.ts before parse so users can still type either form.
    .option(
      '--screenshot [value]',
      'screenshot (alias -ss): [mode[,width,height[,device[,slice-height]]]]'
    )
    .option('--all', 'extract every content type at once')
    .option('--no-metadata', 'omit page metadata from the response')

    .option('--proxy <tier>', 'proxy tier: basic | advanced | auto | none')
    .option('--require-js', 'render with a headless browser')
    .option('--exclude-selectors <csv>', 'CSS selectors to strip, comma-separated')
    .option('--cache-max-age <seconds>', 'cache max age in seconds')

    .option('--locale <bcp47>', 'BCP-47 locale tag (e.g. en-US)')
    .option('--country <iso>', 'ISO 3166-1 alpha-2 country code (e.g. US)')

  addFormatOptions(cmd).action(withErrorHandler(runScrape))
}

export function runScrape(url: string, opts: ScrapeOptions): Promise<void> {
  const body = buildScrapeRequest(url, opts)
  return runCommand({
    opts,
    call: client => client.scrape(body),
    renderText: renderScrapeText,
  })
}

export function buildScrapeRequest(url: string, opts: ScrapeOptions): ScrapeRequest {
  // `--all` turns on every extract flag (full_page screenshot unless `-ss`
  // overrides it). Otherwise flags are opt-in; with nothing picked we default
  // to markdown.
  const wantAll = opts.all === true

  const extract: NonNullable<ScrapeRequest['extract']> = { metadata: opts.metadata !== false }
  if (wantAll || opts.markdown) extract.markdown = true
  if (wantAll || opts.cleanedHtml) extract.cleaned_html = true
  if (wantAll || opts.rawHtml) extract.raw_html = true
  if (wantAll || opts.links) extract.links = true
  if (wantAll || opts.images) extract.images = true
  if (wantAll || opts.screenshot !== undefined) {
    // `opts.screenshot` is only undefined here when wantAll — fall through to
    // a full_page default in that case.
    extract.screenshot = parseScreenshotFlag(opts.screenshot ?? true)
  }

  const pickedAny =
    extract.markdown ||
    extract.cleaned_html ||
    extract.raw_html ||
    extract.links ||
    extract.images ||
    extract.screenshot !== undefined
  if (!pickedAny) extract.markdown = true

  const body: ScrapeRequest = { url, extract }

  if (opts.proxy) body.proxy = parseProxy(opts.proxy)
  if (opts.requireJs) body.require_js = true
  if (opts.excludeSelectors) {
    const selectors = opts.excludeSelectors
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
    if (selectors.length > 0) body.exclude_selectors = selectors
  }
  if (opts.cacheMaxAge !== undefined) {
    body.cache = { max_age: parseNonNegativeInt(opts.cacheMaxAge, '--cache-max-age') }
  }
  if (opts.locale || opts.country) {
    const location: { locale?: string; country?: string } = {}
    if (opts.locale) location.locale = opts.locale
    if (opts.country) location.country = opts.country
    body.location = location
  }

  return body
}
