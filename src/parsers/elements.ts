import { readFileSync } from 'fs'

/**
 * One value to read from the page: a selector string (the text of the first
 * match) or the full object form. Typed here until `@crawlbrulee/sdk` 1.3.0,
 * which types `extract.elements`, is on npm.
 */
export type ElementSpec =
  | string
  | {
      selector: string
      output?: 'text' | 'html' | 'attribute'
      attribute?: string
      all?: boolean
      fields?: Record<string, ElementSpec>
    }

/** `extract.elements`: a name you pick → what to read for it. */
export type ElementsRequest = Record<string, ElementSpec>

/**
 * Merge the repeatable `--element name=selector` shorthand and the
 * `--elements <json>` full form into one `extract.elements` object. Returns
 * `undefined` when neither flag was given.
 *
 * `elements` is a list when it comes from the command line, so a second
 * `--elements` can be refused instead of silently replacing the first.
 */
export function parseElementsFlags(
  element: string[] | undefined,
  elements: string | string[] | undefined
): ElementsRequest | undefined {
  const elementsList = elements === undefined ? [] : Array.isArray(elements) ? elements : [elements]
  if ((element === undefined || element.length === 0) && elementsList.length === 0) {
    return undefined
  }
  if (elementsList.length > 1) {
    throw new Error('--elements is given more than once (put every name in one JSON object)')
  }

  // No prototype, so any name — `__proto__` too — becomes a real key that
  // JSON.stringify sends on.
  const out = Object.create(null) as ElementsRequest
  if (elementsList[0] !== undefined) {
    for (const [name, spec] of Object.entries(parseElementsJson(elementsList[0]))) {
      out[name] = spec
    }
  }

  for (const raw of element ?? []) {
    const [name, selector] = parseElementShorthand(raw)
    if (Object.hasOwn(out, name)) {
      throw new Error(`element name '${name}' is given more than once`)
    }
    out[name] = selector
  }

  return out
}

/** Split `name=selector` on the first `=` only: selectors can hold `=` too. */
function parseElementShorthand(raw: string): [string, string] {
  const eq = raw.indexOf('=')
  if (eq === -1) {
    throw new Error(`invalid --element '${raw}' (must be name=selector)`)
  }
  const name = raw.slice(0, eq).trim()
  const selector = raw.slice(eq + 1).trim()
  if (name.length === 0) {
    throw new Error(`invalid --element '${raw}' (the name before = is empty)`)
  }
  if (selector.length === 0) {
    throw new Error(`invalid --element '${raw}' (the selector after = is empty)`)
  }
  return [name, selector]
}

/** Parse `--elements`: inline JSON, or `@path` to read the JSON from a file. */
function parseElementsJson(raw: string): ElementsRequest {
  // Name a file by its `@path`; inline JSON can be long, so the label just
  // says `--elements`.
  const label = raw.startsWith('@') ? `--elements '${raw}'` : '--elements'
  let text = raw
  if (raw.startsWith('@')) {
    const path = raw.slice(1)
    try {
      text = readFileSync(path, 'utf8')
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`invalid --elements '${raw}' (cannot read the file: ${reason})`)
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`invalid ${label} (must be valid JSON: ${reason})`)
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`invalid ${label} (must be a JSON object)`)
  }
  // Refused on its own, even next to `--element`: an empty object is a mistake.
  if (Object.keys(parsed).length === 0) {
    throw new Error(`invalid ${label} (no elements given: the JSON object is empty)`)
  }
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value !== 'string' && !isPlainObject(value)) {
      throw new Error(`invalid ${label} ('${name}' must be a selector string or an object)`)
    }
  }
  // Deeper checks (selectors, output, fields) are left to the api, which
  // answers a bad spec with a clear 400.
  return parsed as ElementsRequest
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
