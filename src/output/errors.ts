import { CrawlbruleeError, RateLimitError, UsageAllocationError } from '@crawlbrulee/sdk'

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
  if (err instanceof RateLimitError && err.retryAfterMs !== undefined) {
    return ` (retry after ${err.retryAfterMs}ms)`
  }
  if (err instanceof UsageAllocationError) {
    return ` (reason: ${err.reason})`
  }
  if (err.errorName === 'antibot_blocked') {
    return ' (try --proxy advanced or --require-js)'
  }
  return ''
}
