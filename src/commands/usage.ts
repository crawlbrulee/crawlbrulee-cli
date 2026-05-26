import type { Command } from 'commander'

import { renderUsageText } from '../output/render-account.js'
import { addFormatOptions, runCommand, withErrorHandler, type CommonOptions } from './runner.js'

export function registerUsageCommand(program: Command): void {
  const cmd = program
    .command('usage')
    .description('Show current billing cycle usage and limits for the active API token')
    .option('-k, --api-key <key>', 'API key (overrides config + env)')
    .option('--api-url <url>', 'Base URL (overrides config + env)')

  addFormatOptions(cmd).action(withErrorHandler(runUsage))
}

export function runUsage(opts: CommonOptions): Promise<void> {
  return runCommand({
    opts,
    call: client => client.usage(),
    renderText: renderUsageText,
  })
}
