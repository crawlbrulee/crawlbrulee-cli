import type { AsyncScrapeRequest, AsyncScrapeWebhook, ScrapeRequest } from '@crawlbrulee/sdk'
import type { Command } from 'commander'

import {
  renderAsyncScrapeText,
  renderJobStatusText,
  renderScrapeText,
} from '../output/render-scrape.js'
import { resolveFormatMode } from '../output/tty.js'
import { parseDurationSeconds } from '../parsers/duration.js'
import { parseNonNegativeInt } from '../parsers/integers.js'
import { parseProxy } from '../parsers/proxy.js'
import { parseScreenshotFlag } from '../parsers/screenshot.js'
import { withAbortOnSigint } from './abort.js'
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
  keepAds?: boolean
  cacheMaxAge?: string

  locale?: string
  country?: string

  async?: boolean
  webhookUrl?: string
  webhookMetadata?: string

  wait?: boolean
  interval?: string
  timeout?: string
}

/** Polling knobs shared by `scrape wait` and `scrape url --async --wait`. */
export interface WaitOptions extends CommonOptions {
  interval?: string
  timeout?: string
}

function addAuthOptions(cmd: Command): Command {
  return cmd
    .option('-k, --api-key <key>', 'API key (overrides config + env)')
    .option('--api-url <url>', 'Base URL (overrides config + env)')
}

function addWaitOptions(cmd: Command): Command {
  return cmd
    .option('--interval <seconds>', 'seconds between status polls while waiting (default 2)')
    .option(
      '--timeout <seconds>',
      'max seconds to wait before giving up (default 300; 0 = wait forever)'
    )
}

export function registerScrapeCommand(program: Command): void {
  const scrape = program.command('scrape').description('Scrape a URL and manage async scrape jobs')

  registerScrapeUrlCommand(scrape)
  registerScrapeStatusCommand(scrape)
  registerScrapeResultCommand(scrape)
  registerScrapeWaitCommand(scrape)
}

function registerScrapeUrlCommand(scrape: Command): void {
  const cmd = scrape.command('url <url>').description('Scrape a URL via the crawlbrulee API')

  addAuthOptions(cmd)
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

    .option(
      '--proxy <tier>',
      'proxy tier: basic | advanced | auto (default: auto — tries basic tier first, escalates to advanced on failure)'
    )
    .option('--require-js', 'render with a headless browser')
    .option(
      '--exclude-selectors <csv>',
      'CSS selectors to strip, comma-separated (max 100). Shapes the extracted content and the screenshot, never --raw-html'
    )
    .option(
      '--keep-ads',
      'keep ads, cookie banners, consent dialogs and chat widgets (they are removed by default)'
    )
    .option('--cache-max-age <seconds>', 'cache max age in seconds')

    .option('--locale <bcp47>', 'BCP-47 locale tag (e.g. en-US)')
    .option(
      '--country <iso>',
      "ISO 3166-1 alpha-2 country code (e.g. US); 'eu' / 'europe' also accepted"
    )

    .option(
      '--async',
      'submit a background job and print its job_id (does not wait for the result)'
    )
    .option(
      '--wait',
      'with --async, poll until the job finishes and print the result (not the job_id)'
    )
    .option(
      '--webhook-url <url>',
      'completion webhook endpoint, called when the job finishes (requires --async)'
    )
    .option(
      '--webhook-metadata <json>',
      'JSON object echoed back in the webhook payload (requires --webhook-url)'
    )

  addWaitOptions(cmd)
  addFormatOptions(cmd).action(withErrorHandler(runScrapeUrl))
}

function registerScrapeStatusCommand(scrape: Command): void {
  const cmd = scrape
    .command('status <job-id>')
    .description('Show the current status of an async scrape job')
  addAuthOptions(cmd)
  addFormatOptions(cmd).action(withErrorHandler(runScrapeStatus))
}

function registerScrapeResultCommand(scrape: Command): void {
  const cmd = scrape
    .command('result <job-id>')
    .description('Fetch the result of a completed async scrape job')
  addAuthOptions(cmd)
  addFormatOptions(cmd).action(withErrorHandler(runScrapeResult))
}

function registerScrapeWaitCommand(scrape: Command): void {
  const cmd = scrape
    .command('wait <job-id>')
    .description('Poll an async scrape job until it finishes, then print the result')
  addAuthOptions(cmd)
  addWaitOptions(cmd)
  addFormatOptions(cmd).action(withErrorHandler(runScrapeWait))
}

export async function runScrapeUrl(url: string, opts: ScrapeOptions): Promise<void> {
  // --wait polls a background job to completion, so it only makes sense with
  // --async; the polling knobs in turn only make sense with --wait.
  if (opts.wait && !opts.async) {
    throw new Error('--wait requires --async')
  }
  if ((opts.interval !== undefined || opts.timeout !== undefined) && !opts.wait) {
    throw new Error('--interval and --timeout require --wait')
  }

  if (opts.async) {
    const body = buildAsyncScrapeRequest(url, opts)

    if (opts.wait) {
      const wait = resolveWaitParams(opts)
      return runCommand({
        opts,
        call: client =>
          withAbortOnSigint(async signal => {
            const submitted = await client.scrapeAsync(body, { signal })
            emitWaitNote(submitted.job_id, wait, opts)
            return client.waitForScrape(submitted.job_id, { ...wait, signal })
          }),
        renderText: renderScrapeText,
      })
    }

    return runCommand({
      opts,
      call: client => client.scrapeAsync(body),
      renderText: renderAsyncScrapeText,
    })
  }

  // The webhook flags are async-only — flag them rather than silently dropping.
  if (opts.webhookUrl !== undefined) {
    throw new Error('--webhook-url requires --async')
  }
  if (opts.webhookMetadata !== undefined) {
    throw new Error('--webhook-metadata requires --async')
  }

  const body = buildScrapeRequest(url, opts)
  return runCommand({
    opts,
    call: client => client.scrape(body),
    renderText: renderScrapeText,
  })
}

export function runScrapeStatus(jobId: string, opts: CommonOptions): Promise<void> {
  return runCommand({
    opts,
    call: client => client.getScrapeStatus(jobId),
    renderText: renderJobStatusText,
  })
}

export function runScrapeResult(jobId: string, opts: CommonOptions): Promise<void> {
  return runCommand({
    opts,
    call: client => client.getScrapeResult(jobId),
    renderText: renderScrapeText,
  })
}

export function runScrapeWait(jobId: string, opts: WaitOptions): Promise<void> {
  const wait = resolveWaitParams(opts)
  return runCommand({
    opts,
    call: client =>
      withAbortOnSigint(signal => {
        emitWaitNote(jobId, wait, opts)
        return client.waitForScrape(jobId, { ...wait, signal })
      }),
    renderText: renderScrapeText,
  })
}

/** Resolve the `--interval`/`--timeout` seconds flags into SDK milliseconds. */
export function resolveWaitParams(opts: WaitOptions): { intervalMs?: number; timeoutMs?: number } {
  const params: { intervalMs?: number; timeoutMs?: number } = {}
  if (opts.interval !== undefined) {
    params.intervalMs = parseDurationSeconds(opts.interval, '--interval')
  }
  if (opts.timeout !== undefined) {
    params.timeoutMs = parseDurationSeconds(opts.timeout, '--timeout', { allowZero: true })
  }
  return params
}

/**
 * Print a single "waiting…" note to stderr before polling, so stdout stays
 * clean for piping. Silent under `--json` or when stderr is not a terminal.
 */
function emitWaitNote(
  jobId: string,
  wait: { intervalMs?: number; timeoutMs?: number },
  opts: CommonOptions
): void {
  if (resolveFormatMode(opts, process.stderr) !== 'text') return
  const intervalMs = wait.intervalMs ?? 2000
  const timeoutMs = wait.timeoutMs ?? 300_000
  const timeoutNote = timeoutMs === 0 ? 'no timeout' : `timeout ${timeoutMs / 1000}s`
  process.stderr.write(
    `waiting for job ${jobId} — polling every ${intervalMs / 1000}s, ${timeoutNote}…\n`
  )
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
  // `cleanup` is one block server-side. Only send what the caller actually
  // asked for: an omitted field takes the server default, and pinning
  // `ads_and_popups: true` here would just duplicate that default.
  const selectors = (opts.excludeSelectors ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
  if (selectors.length > 0 || opts.keepAds) {
    body.cleanup = {
      ...(opts.keepAds ? { ads_and_popups: false } : {}),
      ...(selectors.length > 0 ? { exclude_selectors: selectors } : {}),
    }
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

export function buildAsyncScrapeRequest(url: string, opts: ScrapeOptions): AsyncScrapeRequest {
  // --webhook-metadata only makes sense alongside a webhook URL.
  if (opts.webhookMetadata !== undefined && opts.webhookUrl === undefined) {
    throw new Error('--webhook-metadata requires --webhook-url')
  }

  const body: AsyncScrapeRequest = buildScrapeRequest(url, opts)

  if (opts.webhookUrl !== undefined) {
    const webhook: AsyncScrapeWebhook = { url: opts.webhookUrl }
    if (opts.webhookMetadata !== undefined) {
      webhook.metadata = parseWebhookMetadata(opts.webhookMetadata)
    }
    body.webhook = webhook
  }

  return body
}

function parseWebhookMetadata(raw: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`invalid --webhook-metadata '${raw}' (must be valid JSON)`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`invalid --webhook-metadata '${raw}' (must be a JSON object)`)
  }
  return parsed as Record<string, unknown>
}
