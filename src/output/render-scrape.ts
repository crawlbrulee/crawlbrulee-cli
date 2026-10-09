import type { AsyncJobStatusResponse, AsyncScrapeResponse, ScrapeResponse } from '@crawlbrulee/sdk'

import { scrapeFooterLine, scrapeUsageLine } from './usage.js'

export function renderAsyncScrapeText(res: AsyncScrapeResponse): string {
  return `job_id: ${res.job_id}`
}

export function renderJobStatusText(res: AsyncJobStatusResponse): string {
  const lines = [`status: ${res.status}`, `job_id: ${res.job_id}`, `created: ${res.created_at}`]

  if (res.status === 'failed' && res.error) {
    lines.push(`# error: ${res.error}`)
  }

  if (res.response_meta?.usage) {
    lines.push(scrapeUsageLine(res.response_meta.usage))
  }

  return lines.join('\n')
}

/** Start a new block: one blank line after earlier output, never two. */
function pushGap(lines: string[]): void {
  if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('')
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
    pushGap(lines)
    if (res.screenshot.slices && res.screenshot.slices.length > 0) {
      lines.push(`screenshot: ${res.screenshot.url} (${res.screenshot.slices.length} slices)`)
      for (const s of res.screenshot.slices) {
        lines.push(`  - ${s.url}`)
      }
    } else {
      lines.push(`screenshot: ${res.screenshot.url}`)
    }
  }
  // In rare cases a screenshot can't be captured. When other outputs were also
  // requested, the response just leaves out the `screenshot` field, so an absent
  // screenshot renders nothing — same as any other output that wasn't returned.
  // A screenshot-only call never reaches this renderer: it fails with an
  // `unsupported_screenshot_output` error instead.

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

  if (res.elements) {
    pushGap(lines)
    lines.push(`elements: ${JSON.stringify(res.elements, null, 2)}`)
  }

  if (lines.length === 0) {
    lines.push(`(no body returned for ${res.url})`)
  }

  const unsupported = res.unsupported_fields ?? []
  const warnings = res.warnings ?? []
  if (unsupported.length > 0 || warnings.length > 0) {
    pushGap(lines)
    // Outputs asked for that this kind of page doesn't have (e.g. `elements`
    // of an XML page): say so, or a missing output has no reason.
    if (unsupported.length > 0) {
      lines.push(`# unsupported: ${unsupported.join(', ')}`)
    }
    for (const w of warnings) {
      lines.push(`# warning: ${w}`)
    }
  }

  // A page the site answered with a non-2xx status (a 404, say) is still a
  // successful scrape: it prints like any page, and the footer names the status.
  const footer = scrapeFooterLine(res)
  if (footer) {
    pushGap(lines)
    lines.push(footer)
  }

  return lines.join('\n')
}
