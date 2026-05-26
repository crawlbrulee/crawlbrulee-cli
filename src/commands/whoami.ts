import type { Command } from 'commander'

import { renderWhoamiText } from '../output/render-account.js'
import { addFormatOptions, runCommand, withErrorHandler, type CommonOptions } from './runner.js'

export function registerWhoamiCommand(program: Command): void {
  const cmd = program
    .command('whoami')
    .description('Show the organization name and token identity for the active API token')
    .option('-k, --api-key <key>', 'API key (overrides config + env)')
    .option('--api-url <url>', 'Base URL (overrides config + env)')

  addFormatOptions(cmd).action(withErrorHandler(runWhoami))
}

export function runWhoami(opts: CommonOptions): Promise<void> {
  return runCommand({
    opts,
    call: client => client.whoami(),
    renderText: renderWhoamiText,
  })
}
