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
  // Read the code as a plain string: `service_unavailable` joins the sdk's
  // `ApiErrorName` union in the next sdk release, and the current floor does
  // not type it yet. Drop the widening once the floor moves.
  const errorName: string | null = err.errorName
  if (errorName === 'service_unavailable') {
    return ' (temporary — safe to retry)'
  }
  return ''
}
