import type { MapUsage, ScrapeResponse, Usage } from '@crawlbrulee/sdk'

/**
 * The api still sends the deprecated `credits` / `screenshot_slices` next to
 * the newer names, and an older api sends only those. Each read prefers the
 * newer field and falls back to the older one until those fields leave the
 * api. The sdk passes json through unchecked, so values are checked here.
 */
function asCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** What the request cost: `total_credit_cost`, or `credits` on an older api. */
export function creditCost(usage: Usage | MapUsage): number {
  return asCount(usage.total_credit_cost) ?? usage.credits
}

/**
 * The screenshot slicing charge (0 or 1): `screenshot_slicing_credit_cost`,
 * or `screenshot_slices` on an older api.
 */
export function slicingCost(usage: Usage): number {
  return asCount(usage.screenshot_slicing_credit_cost) ?? usage.screenshot_slices
}

/**
 * The status the site answered with for the final page, or `undefined` when
 * the response has none (older api) or it isn't an integer.
 */
export function pageStatusCode(res: ScrapeResponse): number | undefined {
  const code = res.page_status_code
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
