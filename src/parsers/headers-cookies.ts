import { readFileSync } from 'fs'

/**
 * One cookie in the request body: the shape the api takes in `cookies`.
 * Local until `@crawlbrulee/sdk` 1.4.0 types the field; then use the sdk type.
 */
export interface ScrapeCookieInput {
  name: string
  value: string
}

// Header and cookie values are often secrets (a session id, a bearer token).
// No message in this file may ever hold a value, or a raw flag string that
// could be one: errors name a header or cookie by its name, or a flag by its
// position (`--header #2`). JSON parse errors are not passed on either,
// because the engine's message quotes a piece of the input.

/**
 * Turn the repeatable `--header "Name: value"` shorthand or the
 * `--headers <json|@file>` full form into the `headers` object of the request.
 * Returns `undefined` when neither flag was given.
 *
 * The two forms may not be mixed: one source for a field is easier to read
 * and leaves no question of which value wins.
 */
export function parseHeadersFlags(
  header: string[] | undefined,
  headers: string | string[] | undefined
): Record<string, string> | undefined {
  const shorthand = header ?? []
  const full = toList(headers)
  if (shorthand.length === 0 && full.length === 0) return undefined
  if (shorthand.length > 0 && full.length > 0) {
    throw new Error('use --header or --headers, not both')
  }
  if (full.length > 1) {
    throw new Error('--headers is given more than once (put every header in one JSON object)')
  }

  // No prototype, so any name becomes a real key that JSON.stringify sends on.
  const out = Object.create(null) as Record<string, string>
  const seen = new Set<string>()
  const add = (name: string, value: string): void => {
    // Header names don't depend on case: `authorization` and `Authorization`
    // are the same header, and the api refuses a name given twice.
    const key = name.toLowerCase()
    if (seen.has(key)) {
      throw new Error(`header '${name}' is given more than once`)
    }
    seen.add(key)
    out[name] = value
  }

  if (full[0] !== undefined) {
    for (const [name, value] of parseHeadersJson(full[0])) add(name, value)
  } else {
    shorthand.forEach((raw, i) => {
      const [name, value] = parseHeaderShorthand(raw, i + 1)
      add(name, value)
    })
  }
  return out
}

/**
 * Turn the repeatable `--cookie name=value` shorthand or the
 * `--cookies <json|@file>` full form into the `cookies` list of the request.
 * Returns `undefined` when neither flag was given. The two forms may not be
 * mixed.
 */
export function parseCookiesFlags(
  cookie: string[] | undefined,
  cookies: string | string[] | undefined
): ScrapeCookieInput[] | undefined {
  const shorthand = cookie ?? []
  const full = toList(cookies)
  if (shorthand.length === 0 && full.length === 0) return undefined
  if (shorthand.length > 0 && full.length > 0) {
    throw new Error('use --cookie or --cookies, not both')
  }
  if (full.length > 1) {
    throw new Error('--cookies is given more than once (put every cookie in one JSON array)')
  }

  if (full[0] !== undefined) return parseCookiesJson(full[0])
  return shorthand.map((raw, i) => parseCookieShorthand(raw, i + 1))
}

/**
 * What a header or cookie name may be made of (an RFC 9110 token), the same
 * rule the api uses. Checked here so a badly split flag, which can leave part
 * of a secret in the name, fails with a position-only message instead of
 * reaching the api's 400, which quotes the name.
 */
const NAME_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

function toList(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Split `Name: value` on the first colon only: a value can hold colons too
 * (a url, a time). Spaces around the name and the value are dropped.
 */
function parseHeaderShorthand(raw: string, position: number): [string, string] {
  const colon = raw.indexOf(':')
  if (colon === -1) {
    throw new Error(`invalid --header #${position} (must be "Name: value", with a colon)`)
  }
  const name = raw.slice(0, colon).trim()
  if (name.length === 0) {
    throw new Error(`invalid --header #${position} (the name before the colon is empty)`)
  }
  if (!NAME_TOKEN.test(name)) {
    throw new Error(`invalid --header #${position} (the name is not a valid header name)`)
  }
  return [name, raw.slice(colon + 1).trim()]
}

/** Split `name=value` on the first `=` only: a value can hold `=` too. */
function parseCookieShorthand(raw: string, position: number): ScrapeCookieInput {
  const eq = raw.indexOf('=')
  if (eq === -1) {
    throw new Error(`invalid --cookie #${position} (must be name=value)`)
  }
  const name = raw.slice(0, eq).trim()
  if (name.length === 0) {
    throw new Error(`invalid --cookie #${position} (the name before = is empty)`)
  }
  if (!NAME_TOKEN.test(name)) {
    throw new Error(`invalid --cookie #${position} (the name is not a valid cookie name)`)
  }
  return { name, value: raw.slice(eq + 1).trim() }
}

/** Parse `--headers`: a JSON object of name → string value. */
function parseHeadersJson(raw: string): [string, string][] {
  const { parsed, text, label } = readJsonFlag('--headers', raw)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`invalid ${label} (must be a JSON object of header name to value)`)
  }
  const entries = Object.entries(parsed)
  if (entries.length === 0) {
    throw new Error(`invalid ${label} (no headers given: the JSON object is empty)`)
  }
  const checked = entries.map(([name, value], i): [string, string] => {
    if (name.trim().length === 0) {
      throw new Error(`invalid ${label} (a header name is empty)`)
    }
    if (!NAME_TOKEN.test(name)) {
      throw new Error(`invalid ${label} (header #${i + 1} is not a valid header name)`)
    }
    if (typeof value !== 'string') {
      throw new Error(`invalid ${label} (the value of '${name}' must be a string)`)
    }
    return [name, value]
  })
  // JSON.parse keeps only the last of two keys spelled the same, so the
  // object can't show a repeat. Count the keys in the text instead. Every
  // name passed the token check above, so naming the repeat is safe.
  const keys = topLevelKeys(text)
  if (keys.length !== entries.length) {
    const repeated = keys.find((key, i) => keys.indexOf(key) !== i)
    throw new Error(`header '${repeated}' is given more than once`)
  }
  return checked
}

/**
 * The keys of the outer object in `text`, repeats included, in order. Only
 * called on text JSON.parse has already accepted, so the walk can trust its
 * shape: a string at depth 1 followed by a colon is a key.
 */
function topLevelKeys(text: string): string[] {
  const keys: string[] = []
  let depth = 0
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"') {
      let end = i + 1
      while (text[end] !== '"') end += text[end] === '\\' ? 2 : 1
      const literal = text.slice(i, end + 1)
      i = end + 1
      if (depth === 1) {
        let next = i
        while (next < text.length && ' \t\n\r'.includes(text[next] as string)) next++
        if (text[next] === ':') keys.push(JSON.parse(literal) as string)
      }
      continue
    }
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') depth--
    i++
  }
  return keys
}

/** Parse `--cookies`: a JSON array of `{ "name": …, "value": … }`. */
function parseCookiesJson(raw: string): ScrapeCookieInput[] {
  const { parsed, label } = readJsonFlag('--cookies', raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`invalid ${label} (must be a JSON array of {"name", "value"} objects)`)
  }
  if (parsed.length === 0) {
    throw new Error(`invalid ${label} (no cookies given: the JSON array is empty)`)
  }
  return parsed.map((item: unknown, i) => {
    const where = `cookie #${i + 1}`
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`invalid ${label} (${where} must be an object with a name and a value)`)
    }
    const { name, value, ...rest } = item as Record<string, unknown>
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error(`invalid ${label} (${where} needs a name: a string that is not empty)`)
    }
    if (!NAME_TOKEN.test(name)) {
      throw new Error(`invalid ${label} (${where} does not have a valid cookie name)`)
    }
    if (typeof value !== 'string') {
      throw new Error(`invalid ${label} (the value of cookie '${name}' must be a string)`)
    }
    const extra = Object.keys(rest)
    if (extra.length > 0) {
      throw new Error(
        `invalid ${label} (cookie '${name}' may only have a name and a value, not ${extra.join(', ')})`
      )
    }
    return { name, value }
  })
}

/** Read inline JSON, or `@path` to read the JSON from a file. */
function readJsonFlag(flag: string, raw: string): { parsed: unknown; text: string; label: string } {
  // Name a file by its `@path`. Inline JSON holds the values, so it is never
  // shown: the label is just the flag.
  const fromFile = raw.startsWith('@')
  const label = fromFile ? `${flag} '${raw}'` : flag
  let text = raw
  if (fromFile) {
    try {
      text = readFileSync(raw.slice(1), 'utf8')
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`invalid ${label} (cannot read the file: ${reason})`)
    }
  }
  try {
    return { parsed: JSON.parse(text), text, label }
  } catch {
    throw new Error(`invalid ${label} (must be valid JSON)`)
  }
}
