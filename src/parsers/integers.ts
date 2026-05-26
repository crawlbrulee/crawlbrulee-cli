// `label` is a user-facing flag name (e.g. '--cache-max-age') threaded into
// the error message for a consistent shape across commands.

export function parseNonNegativeInt(raw: string, label: string): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`invalid ${label} '${raw}' (must be a non-negative integer)`)
  }
  return n
}

export function parsePositiveInt(raw: string, label: string): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`invalid ${label} '${raw}' (must be a positive integer)`)
  }
  return n
}
