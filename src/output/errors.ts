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
  // Read the code as a plain string: `target_unreachable` is not in the
  // `ApiErrorName` union of the current sdk floor (1.0), so comparing the typed
  // value would not compile. Drop the widening once the floor types it.
  const errorName: string | null = err.errorName
  if (errorName === 'service_unavailable') {
    return ' (temporary — safe to retry)'
  }
  if (errorName === 'target_unreachable') {
    // HTTP 502: we could not reach the site (it timed out or its certificate
    // is not valid, for example). Not a problem with the request or the key.
    return ' (retrying later may help)'
  }
  return ''
}
