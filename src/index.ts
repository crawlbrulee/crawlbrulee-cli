import { Command } from 'commander'

import { registerAuthCommands } from './commands/login.js'
import { registerMapCommand } from './commands/map.js'
import { registerScrapeCommand } from './commands/scrape.js'
import { registerUsageCommand } from './commands/usage.js'
import { registerWhoamiCommand } from './commands/whoami.js'
import { CLI_VERSION } from './version.js'

const program = new Command()
program
  .name('crawlbrulee')
  .description('CLI for the crawlbrulee API — scrape and map URLs from your terminal.')
  .version(CLI_VERSION, '-V, --version', 'output the version')

registerAuthCommands(program)
registerScrapeCommand(program)
registerMapCommand(program)
registerUsageCommand(program)
registerWhoamiCommand(program)

// Commander 13 forbids multi-char short flags, so rewrite `-ss` (and
// `-ss=value`) into `--screenshot` before parse.
const argv = process.argv.map(token => {
  if (token === '-ss') return '--screenshot'
  if (token.startsWith('-ss=')) return '--screenshot=' + token.slice(4)
  return token
})

program.parseAsync(argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`error: ${message}\n`)
  process.exit(1)
})
