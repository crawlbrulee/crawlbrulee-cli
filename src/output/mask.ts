export function maskApiKey(key: string): string {
  if (key.length === 0) return ''
  if (key.startsWith('cble_')) {
    return `cble_…${key.slice(-4)}`
  }
  if (key.length <= 8) return '…'
  return `${key.slice(0, 2)}…${key.slice(-2)}`
}
