import { describe, expect, it } from 'vitest'

import { parseDurationSeconds } from '../src/parsers/duration.js'

describe('parseDurationSeconds', () => {
  it('converts whole seconds to milliseconds', () => {
    expect(parseDurationSeconds('2', '--interval')).toBe(2000)
  })

  it('accepts fractional seconds', () => {
    expect(parseDurationSeconds('0.5', '--interval')).toBe(500)
  })

  it('rejects zero by default', () => {
    expect(() => parseDurationSeconds('0', '--interval')).toThrow(
      /invalid --interval '0' \(must be a positive number of seconds\)/
    )
  })

  it('allows zero when allowZero is set (0 = wait indefinitely)', () => {
    expect(parseDurationSeconds('0', '--timeout', { allowZero: true })).toBe(0)
  })

  it('rejects negative values', () => {
    expect(() => parseDurationSeconds('-1', '--timeout', { allowZero: true })).toThrow(
      /invalid --timeout '-1'/
    )
  })

  it('rejects non-numeric values', () => {
    expect(() => parseDurationSeconds('abc', '--interval')).toThrow(/invalid --interval 'abc'/)
  })
})
