import { describe, expect, it } from 'vitest'

import { maskApiKey } from '../src/output/mask.js'

describe('maskApiKey', () => {
  it('keeps the cble_ prefix and reveals only the last 4 chars', () => {
    expect(maskApiKey('cble_ABCDEFGHIJKL1234')).toBe('cble_…1234')
  })

  it('handles short cble_ keys by still using the prefix-+-last-4 form', () => {
    expect(maskApiKey('cble_XY12')).toBe('cble_…XY12')
  })

  it('shows first/last 2 chars for non-cble keys', () => {
    expect(maskApiKey('1234567890abcd')).toBe('12…cd')
  })

  it('returns an ellipsis for very short non-cble keys', () => {
    expect(maskApiKey('short')).toBe('…')
  })

  it('returns empty for an empty key', () => {
    expect(maskApiKey('')).toBe('')
  })
})
