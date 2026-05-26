import { CrawlbruleeError } from '@crawlbrulee/sdk'

export function formatError(err: unknown): string {
  if (err instanceof CrawlbruleeError) {
    const name = err.errorName ?? 'error'
    return `error: ${name} — ${err.message}${hintFor(err)}`
  }
  if (err instanceof Error) {
    return `error: ${err.message}`
  }
  return `error: ${String(err)}`
}

function hintFor(err: CrawlbruleeError): string {
  const d = err.details
  switch (err.errorName) {
    case 'too_many_requests':
      if (d?.error_name === 'too_many_requests' && d.retry_after_ms !== undefined) {
        return ` (retry after ${d.retry_after_ms}ms)`
      }
      return ''
    case 'usage_allocation_error':
      if (d?.error_name === 'usage_allocation_error') {
        return ` (reason: ${d.reason})`
      }
      return ''
    case 'antibot_blocked':
      return ' (try --proxy advanced or --require-js)'
    default:
      return ''
  }
}
