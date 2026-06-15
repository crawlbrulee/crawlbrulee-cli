import type { AsyncScrapeResponse, ScrapeResponse } from '@crawlbrulee/sdk'

export function renderAsyncScrapeText(res: AsyncScrapeResponse): string {
  return `job_id: ${res.job_id}`
}

export function renderScrapeText(res: ScrapeResponse): string {
  const lines: string[] = []

  const title = res.metadata?.title
  if (title) {
    lines.push(`## ${title}`)
    lines.push('')
  }

  // Priority: markdown > cleaned_html > raw_html. Text mode shows one body;
  // callers wanting all of them should use --json.
  const body = res.markdown ?? res.cleaned_html ?? res.raw_html
  if (body) {
    lines.push(body.trimEnd())
  }

  if (res.screenshot) {
    if (lines.length > 0) lines.push('')
    if (res.screenshot.slices && res.screenshot.slices.length > 0) {
      lines.push(`screenshot: ${res.screenshot.url} (${res.screenshot.slices.length} slices)`)
      for (const s of res.screenshot.slices) {
        lines.push(`  - ${s.url}`)
      }
    } else {
      lines.push(`screenshot: ${res.screenshot.url}`)
    }
  }

  if (!body) {
    if (res.links && res.links.length > 0) {
      for (const link of res.links) {
        lines.push(link.href)
      }
    }
    if (res.images && res.images.length > 0) {
      for (const img of res.images) {
        lines.push(img.url)
      }
    }
  }

  if (lines.length === 0) {
    lines.push(`(no body returned for ${res.url})`)
  }

  if (res.warnings && res.warnings.length > 0) {
    lines.push('')
    for (const w of res.warnings) {
      lines.push(`# warning: ${w}`)
    }
  }

  return lines.join('\n')
}
