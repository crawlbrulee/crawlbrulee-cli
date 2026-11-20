import type { AsyncScrapeWebhook } from '@crawlbrulee/sdk'
import type { Command } from 'commander'

import {
  renderAsyncScrapeText,
  renderJobStatusText,
  renderScrapeText,
} from '../output/render-scrape.js'
import { resolveFormatMode } from '../output/tty.js'
import { parseDurationSeconds } from '../parsers/duration.js'
import { parseElementsFlags } from '../parsers/elements.js'
import { parseCookiesFlags, parseHeadersFlags } from '../parsers/headers-cookies.js'
import { parseNonNegativeInt } from '../parsers/integers.js'
import { parsePdfFlag } from '../parsers/pdf.js'
import { parseProxy } from '../parsers/proxy.js'
import { parseScreenshotFlag } from '../parsers/screenshot.js'
import type { CliAsyncScrapeRequest, CliScrapeExtract, CliScrapeRequest } from '../sdk-pending.js'
import { withAbortOnSigint } from './abort.js'
import { addFormatOptions, runCommand, withErrorHandler, type CommonOptions } from './runner.js'

export interface ScrapeOptions extends CommonOptions {
  markdown?: boolean
  cleanedHtml?: boolean
  rawHtml?: boolean
  links?: boolean
  images?: boolean
  screenshot?: string | boolean
  pdf?: string | boolean
  all?: boolean
  metadata?: boolean // `--no-metadata` sets this to false
  element?: string[] // repeatable `--element name=selector`
  // `--elements <json>` or `--elements @file`. A list from the command line, so
  // a second `--elements` is refused rather than replacing the first.
  elements?: string | string[]

  header?: string[] // repeatable `--header "Name: value"`
  cookie?: string[] // repeatable `--cookie name=value`
  // `--headers` / `--cookies <json|@file>`: lists, like `--elements`, so a
  // second one is refused rather than replacing the first.
  headers?: string | string[]
  cookies?: string | string[]

  proxy?: string
  requireJs?: boolean
  excludeSelectors?: string
  keepAds?: boolean
  cacheMaxAge?: string
  zeroDataRetention?: boolean

  locale?: string
  country?: string

  async?: boolean
  webhookUrl?: string
  webhookMetadata?: string

  wait?: boolean
  interval?: string
  timeout?: string
}

export type { CliAsyncScrapeRequest, CliScrapeRequest } from '../sdk-pending.js'

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

/**
 * Shown under `--help` for every command that prints a scrape result. A page
 * the site answered with an error status is data, not a failure.
 */
const PAGE_STATUS_HELP = `
page status:
  a page the site answered with an error status, like a 404, is still a
  successful scrape: you get its content and exit code 0. text output adds
  "page status 404" to the usage line; json has it in page_status_code.
  a real error, like target_unreachable when the site can't be reached,
  goes to stderr with exit code 1.`

/** Commander collector for a flag that can be given more than once. */
function collectRepeatable(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value]
}

/** Shown under `--help` for `scrape url`: where the elements rules live. */
const ELEMENTS_HELP = `
elements:
  --element heading=h1 reads the text of the first <h1> into elements.heading.
  --elements takes the full form (attributes, html, every match, fields per
  match). both can be combined. on their own they return only the elements
  (plus metadata unless --no-metadata); add -m or another content flag to get
  the page too. rules and examples:
  https://crawlbrulee.com/docs/scrape/targeted-extraction`

/** Shown under `--help` for `scrape url`: the pdf and the dark theme. */
const PDF_HELP = `
pdf:
  --pdf saves the page as a pdf: on a4 sheets, as it looks on screen. give
  words, comma-separated, in any order, to change that: pages or single (one
  long page), a4 or letter, landscape, screen or print (the site's print
  style). for example --pdf letter,landscape or --pdf single,print. paper and
  landscape only go with pages. a pdf costs what a screenshot costs, and a pdf
  and a screenshot in one request are billed once. the link expires 24 hours
  after the scrape: download the file.

dark theme:
  end the -ss value with dark to ask the site for its dark theme, for example
  -ss dark or -ss viewport,390,844,mobile,dark. a site without one looks the
  same. with --pdf too, the pdf shows the dark theme; a pdf on its own is
  made with the light theme. no extra credits.`

/** Shown under `--help` for `scrape url`: headers and cookies. */
const HEADERS_HELP = `
headers and cookies:
  send your own http headers and cookies to the site, for example an
  Authorization header or a fixed User-Agent that a site has on its
  allowlist. --header and --cookie can be given more than once; --headers
  and --cookies take the same as JSON, or @file to read it from a file,
  which keeps secrets out of your shell history and the process list. use
  one form per field, not both. headers go only to the origin of the url
  (or its https version, for an http url), cookies only to its host. a
  request with either is never cached. the cli never prints their values.
  details:
  https://crawlbrulee.com/docs/scrape/custom-headers-and-cookies`

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
    .option(
      '-c, --cleaned-html',
      'extract cleaned HTML (scripts, styles, ads and cookie banners removed)'
    )
    .option('-r, --raw-html', 'extract raw HTML')
    .option('-l, --links', 'extract links')
    .option('-i, --images', 'extract inline images')
    // commander 13 rejects multi-char shorts; -ss is rewritten to --screenshot
    // in src/index.ts before parse so users can still type either form.
    .option(
      '--screenshot [value]',
      'screenshot (alias -ss): [mode[,width,height[,device[,slice-height]]]][,dark]'
    )
    .option(
      '--pdf [options]',
      'save the page as a pdf: [pages|single][,a4|letter][,landscape][,screen|print]'
    )
    .option('--all', 'extract every content type at once (add --pdf for a pdf too)')
    .option('--no-metadata', 'omit page metadata from the response')
    .option(
      '--element <name=selector>',
      'read the text of the first match of a CSS selector into elements.<name> (repeatable)',
      collectRepeatable
    )
    .option(
      '--elements <json>',
      'the full elements object as JSON, or @file to read it from a file',
      collectRepeatable
    )
    .option(
      '--header <"Name: value">',
      'send an HTTP header to the site, e.g. "Authorization: Bearer …" (repeatable)',
      collectRepeatable
    )
    .option(
      '--headers <json>',
      'every header as one JSON object, or @file to read it from a file',
      collectRepeatable
    )
    .option('--cookie <name=value>', 'send a cookie to the site (repeatable)', collectRepeatable)
    .option(
      '--cookies <json>',
      'every cookie as a JSON array of {"name", "value"}, or @file to read it from a file',
      collectRepeatable
    )

    .option(
      '--proxy <tier>',
      'proxy tier: basic | advanced | auto (default: auto, which steps up on its own when a site needs more: a stronger proxy, a real browser, or both)'
    )
    .option(
      '--require-js',
      'go straight to a headless browser (without it, a page that needs one still gets one)'
    )
    .option(
      '--exclude-selectors <csv>',
      'CSS selectors to strip, comma-separated (max 100). Shapes the extracted content and the screenshot, never --raw-html'
    )
    .option(
      '--keep-ads',
      'keep ads, cookie banners, consent dialogs and chat widgets (they are removed by default)'
    )
    .option('--cache-max-age <seconds>', 'cache max age in seconds')
    .option(
      '--zero-data-retention',
      'keeps the result out of the shared cache; anything stored to deliver it is kept for 24 hours, then deleted. adds 1 credit. must be enabled for your organization'
    )

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
  addFormatOptions(cmd)
    .addHelpText(
      'after',
      PDF_HELP + '\n' + ELEMENTS_HELP + '\n' + HEADERS_HELP + '\n' + PAGE_STATUS_HELP
    )
    .action(withErrorHandler(runScrapeUrl))
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
  addFormatOptions(cmd)
    .addHelpText('after', PAGE_STATUS_HELP)
    .action(withErrorHandler(runScrapeResult))
}

function registerScrapeWaitCommand(scrape: Command): void {
  const cmd = scrape
    .command('wait <job-id>')
    .description('Poll an async scrape job until it finishes, then print the result')
  addAuthOptions(cmd)
  addWaitOptions(cmd)
  addFormatOptions(cmd)
    .addHelpText('after', PAGE_STATUS_HELP)
    .action(withErrorHandler(runScrapeWait))
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

export function buildScrapeRequest(url: string, opts: ScrapeOptions): CliScrapeRequest {
  // `--all` turns on every extract flag (full_page screenshot unless `-ss`
  // overrides it), but not the pdf: add `--pdf` for that. Otherwise flags are
  // opt-in; with nothing picked we default to markdown, or to elements only
  // when an element flag is given.
  const wantAll = opts.all === true

  const extract: CliScrapeExtract = {
    metadata: opts.metadata !== false,
  }
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
  if (opts.pdf !== undefined && opts.pdf !== false) {
    extract.pdf = parsePdfFlag(opts.pdf)
  }

  const pickedAny =
    extract.markdown ||
    extract.cleaned_html ||
    extract.raw_html ||
    extract.links ||
    extract.images ||
    extract.screenshot !== undefined ||
    extract.pdf !== undefined
  const elements = parseElementsFlags(opts.element, opts.elements)
  if (elements !== undefined) extract.elements = elements

  if (!pickedAny && elements === undefined) {
    extract.markdown = true
  } else if (!wantAll) {
    // Picked flags replace the default. The api turns its default page body on
    // for any body flag left out, and text mode prints one body, markdown
    // first, so a body the caller did not pick would hide the one they did
    // (`-c` or `-r` printing markdown) or crowd out links and images. Send
    // every body that was not picked as false. Elements on their own return
    // only the elements (plus metadata); with a content flag they come on top.
    if (!opts.markdown) extract.markdown = false
    if (!opts.cleanedHtml) extract.cleaned_html = false
  }

  const body: CliScrapeRequest = { url, extract }

  const headers = parseHeadersFlags(opts.header, opts.headers)
  if (headers !== undefined) body.headers = headers
  const cookies = parseCookiesFlags(opts.cookie, opts.cookies)
  if (cookies !== undefined) body.cookies = cookies

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
  if (opts.zeroDataRetention) body.zero_data_retention = true
  if (opts.locale || opts.country) {
    const location: { locale?: string; country?: string } = {}
    if (opts.locale) location.locale = opts.locale
    if (opts.country) location.country = opts.country
    body.location = location
  }

  return body
}

export function buildAsyncScrapeRequest(url: string, opts: ScrapeOptions): CliAsyncScrapeRequest {
  // --webhook-metadata only makes sense alongside a webhook URL.
  if (opts.webhookMetadata !== undefined && opts.webhookUrl === undefined) {
    throw new Error('--webhook-metadata requires --webhook-url')
  }

  const body: CliAsyncScrapeRequest = buildScrapeRequest(url, opts)

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
