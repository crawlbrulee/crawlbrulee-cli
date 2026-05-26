import type { ProxyTier } from '@crawlbrulee/sdk'

const PROXY_TIERS: readonly ProxyTier[] = ['basic', 'advanced', 'auto', 'none']

export function parseProxy(raw: string): ProxyTier {
  if (!PROXY_TIERS.includes(raw as ProxyTier)) {
    throw new Error(`invalid --proxy '${raw}' (expected one of: ${PROXY_TIERS.join(', ')})`)
  }
  return raw as ProxyTier
}
