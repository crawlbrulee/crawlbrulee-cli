import { writeFile } from 'fs/promises'

import { Crawlbrulee } from '@crawlbrulee/sdk'

import { resolveAuth } from '../config/resolve.js'
import { formatError } from '../output/errors.js'
import { renderJson, resolveFormatMode, type FormatOptions } from '../output/tty.js'

export interface CommonOptions extends FormatOptions {
  apiKey?: string
  apiUrl?: string
  output?: string
}

export interface RunOptions<TResponse> {
  opts: CommonOptions
  call: (client: Crawlbrulee) => Promise<TResponse>
  renderText: (res: TResponse) => string
}

export async function runCommand<TResponse>({
  opts,
  call,
  renderText,
}: RunOptions<TResponse>): Promise<void> {
  const { apiKey, apiUrl } = await resolveAuth({
    flagApiKey: opts.apiKey,
    flagApiUrl: opts.apiUrl,
  })

  const client = new Crawlbrulee({ apiKey, baseUrl: apiUrl })
  const res = await call(client)

  // Writing to a file isn't a TTY, so default to JSON unless --text is set.
  const stream = opts.output ? { isTTY: false } : process.stdout
  const mode = resolveFormatMode(opts, stream)
  const rendered = mode === 'json' ? renderJson(res, opts) : renderText(res)
  const out = rendered.endsWith('\n') ? rendered : rendered + '\n'

  if (opts.output) {
    await writeFile(opts.output, out)
  } else {
    process.stdout.write(out)
  }
}

export function withErrorHandler<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<void>
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await action(...args)
    } catch (err: unknown) {
      process.stderr.write(`${formatError(err)}\n`)
      process.exit(1)
    }
  }
}
