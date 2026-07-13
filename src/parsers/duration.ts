// Parse a user-facing duration flag given in **seconds** and return
// **milliseconds** for the SDK. `label` is the flag name (e.g. '--interval')
// threaded into the error for a consistent shape across commands.

export interface ParseDurationOptions {
  /** Allow `0` (used by `--timeout`, where `0` means "wait indefinitely"). */
  allowZero?: boolean
}

export function parseDurationSeconds(
  raw: string,
  label: string,
  options: ParseDurationOptions = {}
): number {
  const seconds = Number(raw)
  const floor = options.allowZero ? 0 : Number.MIN_VALUE
  if (!Number.isFinite(seconds) || seconds < floor) {
    const bound = options.allowZero ? 'non-negative' : 'positive'
    throw new Error(`invalid ${label} '${raw}' (must be a ${bound} number of seconds)`)
  }
  return Math.round(seconds * 1000)
}
