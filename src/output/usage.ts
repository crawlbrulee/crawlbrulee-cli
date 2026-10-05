import type { MapUsage, ScrapeResponse, Usage } from '@crawlbrulee/sdk'

/**
 * The sdk passes json through unchecked, so each cost is checked here. A
 * missing or non-numeric cost reads as `undefined` and its part of the usage
 * line is left out.
 */
function asCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** What the request cost: `total_credit_cost`, or `undefined` when missing. */
export function creditCost(usage: Usage | MapUsage): number | undefined {
  return asCount(usage.total_credit_cost)
}

/**
 * The screenshot slicing charge (0 or 1): `screenshot_slicing_credit_cost`,
 * or `undefined` when missing.
 */
export function slicingCost(usage: Usage): number | undefined {
  return asCount(usage.screenshot_slicing_credit_cost)
}

/**
 * The zero data retention charge (0 or 1): `zero_data_retention_credit_cost`.
 * An older api leaves it out, which reads as 0.
 */
export function zeroDataRetentionCost(usage: Usage | MapUsage): number {
  return asCount(usage.zero_data_retention_credit_cost) ?? 0
}

/** ` · zero data retention +1` when the charge applied, else an empty string. */
function zeroDataRetentionNote(usage: Usage | MapUsage): string {
  return zeroDataRetentionCost(usage) === 1 ? ' · zero data retention +1' : ''
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
  const credits = creditCost(usage)
  const slices = slicingCost(usage)
  const parts = [
    ...(credits === undefined ? [] : [`${credits} credits`]),
    `engine ${usage.engine}`,
    `proxy ${usage.proxy}`,
    ...(slices === undefined ? [] : [`slices ${slices}`]),
  ]
  return `# usage: ${parts.join(' · ')}${zeroDataRetentionNote(usage)}`
}

/** `# usage: …` for a map (no slices). */
export function mapUsageLine(usage: MapUsage): string {
  const credits = creditCost(usage)
  const parts = [
    ...(credits === undefined ? [] : [`${credits} credits`]),
    `engine ${usage.engine}`,
    `proxy ${usage.proxy}`,
  ]
  return `# usage: ${parts.join(' · ')}${zeroDataRetentionNote(usage)}`
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
