import { describe, expect, it } from 'vitest'

import { maskApiKey } from '../src/output/mask.js'

describe('maskApiKey', () => {
  it('keeps the cwbl_ prefix and reveals only the last 4 chars', () => {
    expect(maskApiKey('cwbl_ABCDEFGHIJKL1234')).toBe('cwbl_…1234')
  })

  it('handles short cwbl_ keys by still using the prefix-+-last-4 form', () => {
    expect(maskApiKey('cwbl_XY12')).toBe('cwbl_…XY12')
  })

  it('masks the legacy cble_ prefix the same way (old keys still authenticate)', () => {
    expect(maskApiKey('cble_ABCDEFGHIJKL1234')).toBe('cble_…1234')
  })

  it('shows first/last 2 chars for non-cwbl keys', () => {
    expect(maskApiKey('1234567890abcd')).toBe('12…cd')
  })

  it('returns an ellipsis for very short non-cwbl keys', () => {
    expect(maskApiKey('short')).toBe('…')
  })

  it('returns empty for an empty key', () => {
    expect(maskApiKey('')).toBe('')
  })
})
