import type { CliMapLinkItem, CliMapResponse } from '../sdk-pending.js'
import { mapUsageLine } from './usage.js'

// `sitemap` is the longest link type; a lastmod is an ISO 8601 time in UTC.
const TYPE_WIDTH = 'sitemap'.length
const LASTMOD_WIDTH = '2026-01-01T00:00:00.000Z'.length

export interface MapTextOptions {
  /**
   * Print `<type> <lastmod> <url>` on each line. The map command turns it on
   * for `--entries all`, where pages and sitemap files mix. Otherwise each
   * line is just the url, so the output pipes straight into the next command.
   */
  showTypes?: boolean
}

/** One line per link. The url stays last, so `awk '{print $NF}'` still gives the urls. */
function linkLine(link: CliMapLinkItem, showTypes: boolean): string {
  if (!showTypes) return link.url
  // An older api sends neither field: print `-` rather than fail.
  const type = (link.type ?? '-').padEnd(TYPE_WIDTH)
  const lastmod = (link.lastmod ?? '-').padEnd(LASTMOD_WIDTH)
  return `${type} ${lastmod} ${link.url}`
}

export function renderMapText(res: CliMapResponse, options: MapTextOptions = {}): string {
  const showTypes = options.showTypes === true
  const lines: string[] = res.links.map(l => linkLine(l, showTypes))

  const { has_more, total, page, limit } = res.response_meta.pagination
  if (has_more) {
    const seen = (page - 1) * limit + res.links.length
    const remaining = total - seen
    const nextPage = page + 1
    lines.push('')
    lines.push(
      remaining > 0
        ? `# … and ${remaining} more (use --page ${nextPage})`
        : `# more pages available (use --page ${nextPage})`
    )
  }

  // Sitemap files this call knew about but did not read whole: each one is
  // read next with its own `--sitemap-url <url>` call (a file that says it is
  // over the size limit can't be read by any call). An older api leaves the
  // list out.
  const unread = res.response_meta.truncation?.unread_sitemaps ?? []
  if (unread.length > 0) {
    if (!has_more) lines.push('')
    lines.push(`# ${unread.length} sitemap files not read (read each with --sitemap-url <url>):`)
    for (const url of unread) {
      lines.push(`#   ${url}`)
    }
  }

  if (res.response_meta.usage) {
    if (!has_more && unread.length === 0) lines.push('')
    lines.push(mapUsageLine(res.response_meta.usage))
  }

  return lines.join('\n')
}
