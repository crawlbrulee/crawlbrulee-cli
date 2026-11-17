import type { PdfMedia, PdfPaper, PdfRequest } from '../sdk-pending.js'

export class PdfParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfParseError'
  }
}

// commander passes `true` for a bare `--pdf`, or the string for `--pdf <value>`.
type PdfFlagInput = string | boolean | undefined

const LAYOUT_WORDS: Readonly<Record<string, 'pages' | 'single_page'>> = {
  pages: 'pages',
  single: 'single_page',
  single_page: 'single_page',
}
const PAPER_WORDS: readonly PdfPaper[] = ['a4', 'letter']
const MEDIA_WORDS: readonly PdfMedia[] = ['screen', 'print']
const LANDSCAPE_WORD = 'landscape'

const EXPECTED = `expected pages, single (or single_page), a4, letter, landscape, screen or print`

/**
 * Parse `--pdf [value]` into `extract.pdf`.
 *
 * The value is a comma-separated list of words, in any order, since no word
 * belongs to two options: a layout (`pages`, `single` / `single_page`), a paper
 * size (`a4`, `letter`), `landscape`, and a media (`screen`, `print`). A bare
 * `--pdf` sends `{}`, which takes every default. Only the words given are
 * sent, so the api fills in the rest itself.
 */
export function parsePdfFlag(raw: PdfFlagInput): PdfRequest {
  if (raw === undefined || raw === true || raw === '') {
    return {}
  }
  if (typeof raw !== 'string') {
    throw new PdfParseError('unexpected --pdf value type')
  }

  const result: PdfRequest = {}
  const words = raw.split(',').map(s => s.trim().toLowerCase())

  for (const word of words) {
    if (!word) {
      throw new PdfParseError(`empty value in --pdf '${raw}' (${EXPECTED})`)
    }

    const layout = LAYOUT_WORDS[word]
    if (layout !== undefined) {
      setOnce(result, 'layout', layout, raw)
      continue
    }
    if ((PAPER_WORDS as readonly string[]).includes(word)) {
      setOnce(result, 'paper', word as PdfPaper, raw)
      continue
    }
    if (word === LANDSCAPE_WORD) {
      setOnce(result, 'landscape', true, raw)
      continue
    }
    if ((MEDIA_WORDS as readonly string[]).includes(word)) {
      setOnce(result, 'media', word as PdfMedia, raw)
      continue
    }
    throw new PdfParseError(`invalid --pdf value '${word}' (${EXPECTED})`)
  }

  // Paper and landscape lay the page out on sheets, so they don't go with one long page.
  if (result.layout === 'single_page') {
    if (result.paper !== undefined) {
      throw new PdfParseError(
        `a paper size can't be used with single: one long page has no paper size`
      )
    }
    if (result.landscape !== undefined) {
      throw new PdfParseError(`landscape can't be used with single: it only turns sheets of paper`)
    }
  }

  return result
}

/** Set one option, and refuse a second word for the same option (`a4,letter`). */
function setOnce<K extends keyof PdfRequest>(
  result: PdfRequest,
  key: K,
  value: NonNullable<PdfRequest[K]>,
  raw: string
): void {
  if (result[key] !== undefined) {
    throw new PdfParseError(`--pdf '${raw}' gives the ${key} more than once`)
  }
  result[key] = value
}
