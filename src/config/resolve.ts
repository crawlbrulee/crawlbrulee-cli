import { readConfig } from './store.js'

export const DEFAULT_API_URL = 'https://api.crawlbrulee.com'

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
    super('not logged in — run `crawlbrulee login` or set CRAWLBRULEE_API_KEY')
    this.name = 'MissingAuthError'
  }
}

export async function resolveAuth(input: AuthResolverInput): Promise<ResolvedAuth> {
  const file = await readConfig()

  const apiKey = pickFirstNonEmpty(input.flagApiKey, process.env.CRAWLBRULEE_API_KEY, file.apiKey)
  const apiUrl =
    pickFirstNonEmpty(input.flagApiUrl, process.env.CRAWLBRULEE_API_URL, file.apiUrl) ??
    DEFAULT_API_URL

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
