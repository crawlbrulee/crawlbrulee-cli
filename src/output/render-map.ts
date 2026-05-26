import type { MapResponse } from '@crawlbrulee/sdk'

export function renderMapText(res: MapResponse): string {
  const lines: string[] = res.links.map(l => l.url)

  const { has_more, total, page, limit } = res.meta.pagination
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

  return lines.join('\n')
}
