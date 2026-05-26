import { password } from '@inquirer/prompts'
import type { Command } from 'commander'

import { clearConfig, readConfig, writeConfig } from '../config/store.js'
import { DEFAULT_API_URL } from '../config/resolve.js'
import { maskApiKey } from '../output/mask.js'

interface LoginOptions {
  apiKey?: string
  apiUrl?: string
}

export function registerAuthCommands(program: Command): void {
  program
    .command('login')
    .description('Save your API key and base URL for future commands')
    .option('-k, --api-key <key>', 'API key (non-interactive when provided)')
    .option('--api-url <url>', 'Base URL of the crawlbrulee API')
    .action(async (opts: LoginOptions) => {
      const apiKey = opts.apiKey?.trim() || (await promptForApiKey())
      if (!apiKey) throw new Error('no API key provided')

      const apiUrl = opts.apiUrl?.trim() || undefined
      const update = apiUrl ? { apiKey, apiUrl } : { apiKey }
      await writeConfig(update)

      const parts = [`api_key: ${maskApiKey(apiKey)}`]
      if (apiUrl) parts.push(`api_url: ${apiUrl}`)
      process.stdout.write(`saved (${parts.join(', ')})\n`)
    })

  program
    .command('logout')
    .description('Remove the saved API key and base URL')
    .action(async () => {
      await clearConfig()
      process.stdout.write('logged out\n')
    })

  program
    .command('view-config')
    .description('Print the saved API key (masked) and base URL')
    .action(async () => {
      const cfg = await readConfig()
      const apiUrl = cfg.apiUrl ?? `(not set — defaults to ${DEFAULT_API_URL})`
      const apiKey = cfg.apiKey ? maskApiKey(cfg.apiKey) : '(not set)'

      process.stdout.write(`api_url: ${apiUrl}\n`)
      process.stdout.write(`api_key: ${apiKey}\n`)

      for (const name of ['CRAWLBRULEE_API_KEY', 'CRAWLBRULEE_API_URL']) {
        if (process.env[name]) {
          process.stdout.write(`# $${name} is set in the environment — overrides config file\n`)
        }
      }
    })
}

async function promptForApiKey(): Promise<string> {
  const entered = await password({ message: 'Paste your crawlbrulee API key:', mask: '*' })
  return entered.trim()
}
