import { DEFAULT_BASE_URL, ENV_API_KEY } from '@crawlbrulee/sdk'

import { readConfig } from './store.js'

/** Default API base URL, sourced from the SDK so the CLI never drifts. */
export const DEFAULT_API_URL = DEFAULT_BASE_URL

/** Env var the CLI reads for the API key (same name the SDK reads). */
export { ENV_API_KEY }

/** Env var the CLI reads to override the API base URL. CLI-specific. */
export const ENV_API_URL = 'CRAWLBRULEE_API_URL'

export interface ResolvedAuth {
  apiKey: string
  apiUrl: string
}

export interface AuthResolverInput {
  flagApiKey?: string
  flagApiUrl?: string
}

export class MissingAuthError extends Error {
  constructor() {
    super(`not logged in — run \`crawlbrulee login\` or set ${ENV_API_KEY}`)
    this.name = 'MissingAuthError'
  }
}

export async function resolveAuth(input: AuthResolverInput): Promise<ResolvedAuth> {
  const file = await readConfig()

  const apiKey = pickFirstNonEmpty(input.flagApiKey, process.env[ENV_API_KEY], file.apiKey)
  const apiUrl =
    pickFirstNonEmpty(input.flagApiUrl, process.env[ENV_API_URL], file.apiUrl) ?? DEFAULT_API_URL

  if (!apiKey) {
    throw new MissingAuthError()
  }

  return { apiKey, apiUrl }
}

function pickFirstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) return v
  }
  return undefined
}
