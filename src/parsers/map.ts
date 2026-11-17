import type { MapEntries } from '../sdk-pending.js'

const ENTRIES: readonly MapEntries[] = ['pages', 'sitemaps', 'all']

/**
 * `--depth`: a whole number, 0 or more. The api checks the maximum and answers
 * a clear 400 above it, so the cli does not hold its own copy of that limit.
 */
export function parseDepth(raw: string): number {
  const n = Number(raw)
  if (raw.trim() === '' || !Number.isInteger(n) || n < 0) {
    throw new Error(`invalid --depth '${raw}' (must be a whole number, 0 or more)`)
  }
  return n
}

export function parseEntries(raw: string): MapEntries {
  const lower = raw.toLowerCase()
  if (!ENTRIES.includes(lower as MapEntries)) {
    throw new Error(`invalid --entries '${raw}' (expected one of: ${ENTRIES.join(', ')})`)
  }
  return lower as MapEntries
}

// A plain date, or an ISO 8601 date and time with a time zone (`Z` or `+01:00`).
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

/**
 * `--modified-since`: a date and time to send as `modified_since`. A plain
 * date (`2026-11-01`) means the start of that day in UTC. A date and time
 * goes to the api as typed, so it must say its time zone.
 */
export function parseModifiedSince(raw: string): string {
  const value = raw.trim()
  const isDateOnly = DATE_ONLY.test(value)
  const candidate = isDateOnly ? `${value}T00:00:00Z` : value
  if ((!isDateOnly && !DATE_TIME.test(value)) || Number.isNaN(Date.parse(candidate))) {
    throw new Error(
      `invalid --modified-since '${raw}' (use a date like 2026-11-01, or a date and time with a time zone like 2026-11-01T08:00:00Z)`
    )
  }
  return candidate
}
