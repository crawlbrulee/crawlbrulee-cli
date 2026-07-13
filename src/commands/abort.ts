/**
 * Run `fn` with an {@link AbortSignal} that trips on the first `SIGINT`
 * (Ctrl-C), so a long-running wait can be cancelled cleanly. The SDK turns an
 * aborted signal into a typed `CrawlbruleeError` (`client_closed_request`),
 * which the command's error handler renders and exits on.
 *
 * The listener is always removed in `finally`, so this leaves no handler behind
 * for the rest of the process.
 */
export async function withAbortOnSigint<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const onSigint = (): void => controller.abort()
  process.once('SIGINT', onSigint)
  try {
    return await fn(controller.signal)
  } finally {
    process.removeListener('SIGINT', onSigint)
  }
}
