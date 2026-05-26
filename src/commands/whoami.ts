import type { Command } from 'commander'

import { renderWhoamiText } from '../output/render-account.js'
import { runCommand, withErrorHandler, type CommonOptions } from './runner.js'

export function registerWhoamiCommand(program: Command): void {
  program
    .command('whoami')
    .description('Show the organization name and token identity for the active API token')
    .option('-k, --api-key <key>', 'API key (overrides config + env)')
    .option('--api-url <url>', 'Base URL (overrides config + env)')

    .option('--json', 'force JSON output (default when piped)')
    .option('--text', 'force human-readable output (default in a terminal)')
    .option('--compact', 'one-line JSON (only meaningful with --json)')
    .option('-o, --output <file>', 'write the output to <file> instead of stdout')

    .action(withErrorHandler(runWhoami))
}

export function runWhoami(opts: CommonOptions): Promise<void> {
  return runCommand({
    opts,
    call: client => client.whoami(),
    renderText: renderWhoamiText,
  })
}
