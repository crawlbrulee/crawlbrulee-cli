import type { MapUsage, ScrapeResponse, Usage } from '@crawlbrulee/sdk'

/**
 * Newer fields on scrape and map responses that `@crawlbrulee/sdk` 1.0 does
 * not type yet. They are all optional: older api responses leave them out, so
 * each read falls back to the older field.
 *
 * TODO(sdk 1.1): once the sdk floor types these, read them straight off
 * `ScrapeResponse` / `Usage` / `MapUsage` and delete this file's casts. Keep
 * the fallbacks to `credits` / `screenshot_slices` until those fields leave
 * the api.
 */
interface NewerUsageFields {
  total_credit_cost?: unknown
  screenshot_slicing_credit_cost?: unknown
}

interface NewerScrapeFields {
  page_status_code?: unknown
}

function asCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** What the request cost: `total_credit_cost`, or `credits` on an older api. */
export function creditCost(usage: Usage | MapUsage): number {
  return asCount((usage as NewerUsageFields).total_credit_cost) ?? usage.credits
}

/**
 * The screenshot slicing charge (0 or 1): `screenshot_slicing_credit_cost`,
 * or `screenshot_slices` on an older api.
 */
export function slicingCost(usage: Usage): number {
  return (
    asCount((usage as NewerUsageFields).screenshot_slicing_credit_cost) ?? usage.screenshot_slices
  )
}

/**
 * The status the site answered with for the final page, or `undefined` when
 * the response has none (older api) or it isn't an integer.
 */
export function pageStatusCode(res: ScrapeResponse): number | undefined {
  const code = (res as NewerScrapeFields).page_status_code
  return typeof code === 'number' && Number.isInteger(code) ? code : undefined
}

/** `page status 404` for a page that isn't 2xx, else `undefined`. */
function pageStatusNote(res: ScrapeResponse): string | undefined {
  const code = pageStatusCode(res)
  if (code === undefined || (code >= 200 && code < 300)) return undefined
  return `page status ${code}`
}

/** `# usage: …` for a scrape or a finished async job. */
export function scrapeUsageLine(usage: Usage): string {
  return `# usage: ${creditCost(usage)} credits · engine ${usage.engine} · proxy ${usage.proxy} · slices ${slicingCost(usage)}`
}

/** `# usage: …` for a map (no slices). */
export function mapUsageLine(usage: MapUsage): string {
  return `# usage: ${creditCost(usage)} credits · engine ${usage.engine} · proxy ${usage.proxy}`
}

/**
 * The closing comment line of a scrape in text mode: the usage, plus the
 * page status when the site answered with something other than 2xx. Without
 * a usage object the page status gets a line of its own. `undefined` when
 * there is nothing to show.
 */
export function scrapeFooterLine(res: ScrapeResponse): string | undefined {
  const usage = res.response_meta?.usage
  const note = pageStatusNote(res)
  if (usage) return note ? `${scrapeUsageLine(usage)} · ${note}` : scrapeUsageLine(usage)
  return note ? `# ${note}` : undefined
}
