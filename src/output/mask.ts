// Current keys are prefixed `cwbl_` (prod) / `cwbl_staging_` (staging); the
// legacy `cble_` prefix still authenticates, so mask both the same way.
const KEY_PREFIXES = ['cwbl_', 'cble_'] as const

export function maskApiKey(key: string): string {
  if (key.length === 0) return ''
  const prefix = KEY_PREFIXES.find(p => key.startsWith(p))
  if (prefix) {
    return `${prefix}…${key.slice(-4)}`
  }
  if (key.length <= 8) return '…'
  return `${key.slice(0, 2)}…${key.slice(-2)}`
}
