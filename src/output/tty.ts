export type FormatMode = 'json' | 'text'

export interface FormatOptions {
  json?: boolean
  text?: boolean
  compact?: boolean
}

interface StreamLike {
  isTTY?: boolean
}

export function resolveFormatMode(
  opts: FormatOptions,
  stream: StreamLike = process.stdout
): FormatMode {
  if (opts.json) return 'json'
  if (opts.text) return 'text'
  return stream.isTTY ? 'text' : 'json'
}

export function renderJson(value: unknown, opts: FormatOptions): string {
  return opts.compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)
}
