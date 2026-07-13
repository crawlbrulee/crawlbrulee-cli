import type { ProxyTier } from '@crawlbrulee/sdk'

// `none` is an internal-only capability used during testing — it is deliberately
// not user-selectable, so the CLI rejects it as a --proxy value. (It can still
// appear as a *resolved* tier in response_meta.usage.proxy, e.g. on a cache hit.)
const PROXY_TIERS: readonly ProxyTier[] = ['basic', 'advanced', 'auto']

export function parseProxy(raw: string): ProxyTier {
  if (!PROXY_TIERS.includes(raw as ProxyTier)) {
    throw new Error(`invalid --proxy '${raw}' (expected one of: ${PROXY_TIERS.join(', ')})`)
  }
  return raw as ProxyTier
}
