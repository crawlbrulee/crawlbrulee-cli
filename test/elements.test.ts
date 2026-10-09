import type { ScrapeResponse } from '@crawlbrulee/sdk'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildAsyncScrapeRequest,
  buildScrapeRequest,
  registerScrapeCommand,
  runScrapeResult,
  runScrapeUrl,
} from '../src/commands/scrape.js'
import { renderScrapeText } from '../src/output/render-scrape.js'
import { parseElementsFlags } from '../src/parsers/elements.js'

const JSON_HEADERS = { 'content-type': 'application/json' }
const AUTH = { apiKey: 'cwbl_test_key', apiUrl: 'https://staging-api.example.com' }

const BOOKS = {
  books: {
    selector: 'article.product_pod',
    all: true,
    fields: {
      title: { selector: 'h3 a', output: 'attribute', attribute: 'title' },
      price: '.price_color',
    },
  },
}

describe('parseElementsFlags — --element name=selector', () => {
  it('returns undefined when neither flag is given', () => {
    expect(parseElementsFlags(undefined, undefined)).toBeUndefined()
    expect(parseElementsFlags([], undefined)).toBeUndefined()
  })

  it('turns each --element into a name → selector string', () => {
    expect(parseElementsFlags(['heading=h1', 'price=.price_color'], undefined)).toEqual({
      heading: 'h1',
      price: '.price_color',
    })
  })

  it('splits on the first = only, so a selector can hold =', () => {
    expect(parseElementsFlags(['next=a[href="page-2.html"]'], undefined)).toEqual({
      next: 'a[href="page-2.html"]',
    })
  })

  it('trims spaces around the name and the selector', () => {
    expect(parseElementsFlags([' heading = h1 '], undefined)).toEqual({ heading: 'h1' })
  })

  it('rejects a value with no =', () => {
    expect(() => parseElementsFlags(['h1'], undefined)).toThrow(
      /invalid --element 'h1' \(must be name=selector\)/
    )
  })

  it('rejects an empty name', () => {
    expect(() => parseElementsFlags(['=h1'], undefined)).toThrow(
      /invalid --element '=h1'.*name before = is empty/
    )
  })

  it('rejects an empty selector', () => {
    expect(() => parseElementsFlags(['heading='], undefined)).toThrow(
      /invalid --element 'heading='.*selector after = is empty/
    )
  })

  it('rejects the same name twice', () => {
    expect(() => parseElementsFlags(['a=h1', 'a=h2'], undefined)).toThrow(
      /element name 'a' is given more than once/
    )
  })

  it('keeps any name as a real key, __proto__ too', () => {
    const out = parseElementsFlags(['__proto__=h1', 'constructor=h2'], undefined)
    expect(Object.keys(out ?? {})).toEqual(['__proto__', 'constructor'])
    expect(JSON.stringify(out)).toBe('{"__proto__":"h1","constructor":"h2"}')
  })

  it('still rejects __proto__ given twice, also across both flags', () => {
    expect(() => parseElementsFlags(['__proto__=h1'], '{"__proto__": "h2"}')).toThrow(
      /element name '__proto__' is given more than once/
    )
  })
})

describe('parseElementsFlags — --elements <json>', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'crawlbrulee-cli-elements-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('passes a JSON object through as it is', () => {
    expect(parseElementsFlags(undefined, JSON.stringify(BOOKS))).toEqual(BOOKS)
  })

  it('reads the JSON from a file with @path', async () => {
    const path = join(dir, 'elements.json')
    await writeFile(path, JSON.stringify(BOOKS))
    expect(parseElementsFlags(undefined, `@${path}`)).toEqual(BOOKS)
  })

  it('says so when the @file cannot be read', () => {
    const path = join(dir, 'missing.json')
    expect(() => parseElementsFlags(undefined, `@${path}`)).toThrow(
      /invalid --elements '@.*missing\.json' \(cannot read the file/
    )
  })

  it('rejects bad JSON with the parse reason', () => {
    expect(() => parseElementsFlags(undefined, '{"heading": "h1", not json}')).toThrow(
      /^invalid --elements \(must be valid JSON: .+\)$/
    )
  })

  it('rejects bad JSON in an @file, naming the file', async () => {
    const path = join(dir, 'bad.json')
    await writeFile(path, '{"heading": ')
    expect(() => parseElementsFlags(undefined, `@${path}`)).toThrow(
      /invalid --elements '@.*bad\.json' \(must be valid JSON: .+\)/
    )
  })

  it('rejects an empty object: no elements given', () => {
    expect(() => parseElementsFlags(undefined, '{}')).toThrow(
      /invalid --elements \(no elements given/
    )
  })

  it('rejects an empty object even when --element gives names', () => {
    expect(() => parseElementsFlags(['a=h1'], '{}')).toThrow(
      /invalid --elements \(no elements given/
    )
  })

  it('rejects a second --elements instead of keeping the last one', () => {
    expect(() => parseElementsFlags(undefined, ['{"a": "h1"}', '{"b": "h2"}'])).toThrow(
      /--elements is given more than once/
    )
  })

  it('takes a single --elements from the command line list', () => {
    expect(parseElementsFlags(undefined, ['{"a": "h1"}'])).toEqual({ a: 'h1' })
  })

  it('rejects JSON that is not an object', () => {
    expect(() => parseElementsFlags(undefined, '["h1"]')).toThrow(
      /invalid --elements \(must be a JSON object\)/
    )
    expect(() => parseElementsFlags(undefined, 'null')).toThrow(/must be a JSON object/)
  })

  it('rejects a value that is neither a selector string nor an object', () => {
    expect(() => parseElementsFlags(undefined, '{"heading": 1}')).toThrow(
      /'heading' must be a selector string or an object/
    )
  })
})

describe('parseElementsFlags — both flags together', () => {
  it('merges --element into the --elements object', () => {
    expect(parseElementsFlags(['heading=h1'], JSON.stringify(BOOKS))).toEqual({
      ...BOOKS,
      heading: 'h1',
    })
  })

  it('rejects a name given in both', () => {
    expect(() => parseElementsFlags(['books=h1'], JSON.stringify(BOOKS))).toThrow(
      /element name 'books' is given more than once/
    )
  })
})

describe('buildScrapeRequest — elements', () => {
  it('on their own, asks for the elements only (markdown and cleaned_html off)', () => {
    const body = buildScrapeRequest('https://example.com', { element: ['heading=h1'] })
    expect(body.extract).toEqual({
      metadata: true,
      markdown: false,
      cleaned_html: false,
      elements: { heading: 'h1' },
    })
  })

  it('on their own, still follows --no-metadata', () => {
    const body = buildScrapeRequest('https://example.com', {
      metadata: false,
      elements: JSON.stringify(BOOKS),
    })
    expect(body.extract).toEqual({
      metadata: false,
      markdown: false,
      cleaned_html: false,
      elements: BOOKS,
    })
  })

  it('with -m, the elements come on top of the markdown', () => {
    const body = buildScrapeRequest('https://example.com', {
      markdown: true,
      element: ['heading=h1'],
    })
    expect(body.extract).toEqual({ metadata: true, markdown: true, elements: { heading: 'h1' } })
  })

  it('with --all, the elements come on top of every content type', () => {
    const body = buildScrapeRequest('https://example.com', { all: true, element: ['heading=h1'] })
    expect(body.extract).toMatchObject({
      markdown: true,
      cleaned_html: true,
      raw_html: true,
      elements: { heading: 'h1' },
    })
  })

  it('with --screenshot, the elements come on top of the screenshot', () => {
    const body = buildScrapeRequest('https://example.com', {
      screenshot: true,
      element: ['heading=h1'],
    })
    expect(body.extract).toEqual({
      metadata: true,
      screenshot: { type: 'full_page' },
      elements: { heading: 'h1' },
    })
  })

  it('keeps the content flags that were picked', () => {
    const body = buildScrapeRequest('https://example.com', {
      links: true,
      elements: JSON.stringify(BOOKS),
    })
    expect(body.extract).toEqual({ metadata: true, links: true, elements: BOOKS })
  })

  it('leaves elements out when no element flag is given', () => {
    const body = buildScrapeRequest('https://example.com', {})
    expect(body.extract).not.toHaveProperty('elements')
  })

  it('the async request carries them too', () => {
    const body = buildAsyncScrapeRequest('https://example.com', { element: ['heading=h1'] })
    expect(body.extract).toMatchObject({ elements: { heading: 'h1' } })
  })
})

describe('renderScrapeText — elements', () => {
  const base: ScrapeResponse = {
    url: 'https://books.toscrape.com/',
    requested_url: 'https://books.toscrape.com/',
    markdown: 'body',
    response_meta: {
      usage: {
        total_credit_cost: 1,
        screenshot_slicing_credit_cost: 0,
        engine: 'http',
        proxy: 'basic',
        zero_data_retention_credit_cost: 0,
      },
    },
  }

  it('prints the elements as pretty JSON after the body', () => {
    const out = renderScrapeText({
      ...base,
      elements: {
        heading: 'All products',
        books: [{ title: 'A Light in the Attic', price: '£51.77' }],
        next_page: null,
      },
    } as ScrapeResponse)
    expect(out).toContain('body\n\nelements: {\n  "heading": "All products",')
    expect(out).toContain('"title": "A Light in the Attic"')
    expect(out).toContain('"next_page": null')
  })

  it('prints only the elements when the response has no body', () => {
    const { markdown: _markdown, ...noBody } = base
    const out = renderScrapeText({
      ...noBody,
      elements: { heading: 'All products' },
    } as ScrapeResponse)
    expect(out).toMatch(/^elements: \{\n {2}"heading": "All products"\n\}/)
    expect(out).not.toContain('no body returned')
  })

  it('prints nothing for elements when the response has none', () => {
    expect(renderScrapeText(base)).not.toContain('elements')
  })

  it('keeps one blank line between the title and the elements when there is no body', () => {
    const { markdown: _markdown, ...noBody } = base
    const out = renderScrapeText({
      ...noBody,
      metadata: { title: 'All products' },
      elements: { heading: 'All products' },
    } as ScrapeResponse)
    expect(out).toMatch(/^## All products\n\nelements: \{/)
  })

  it('keeps one blank line between the title and a screenshot when there is no body', () => {
    const { markdown: _markdown, ...noBody } = base
    const out = renderScrapeText({
      ...noBody,
      metadata: { title: 'All products' },
      screenshot: { url: 'https://cdn/x.png' },
    } as ScrapeResponse)
    expect(out).toMatch(/^## All products\n\nscreenshot: https:\/\/cdn\/x\.png\n\n/)
  })

  it('says which outputs the page does not support', () => {
    const { markdown: _markdown, ...noBody } = base
    const out = renderScrapeText({
      ...noBody,
      url: 'https://example.com/feed.xml',
      unsupported_fields: ['elements', 'metadata'],
    } as ScrapeResponse)
    expect(out).toContain(
      '(no body returned for https://example.com/feed.xml)\n\n# unsupported: elements, metadata\n\n'
    )
  })

  it('prints the unsupported line next to the warnings, one blank line after a title', () => {
    const { markdown: _markdown, ...noBody } = base
    const out = renderScrapeText({
      ...noBody,
      metadata: { title: 'Feed' },
      unsupported_fields: ['elements'],
      warnings: ['links_unavailable'],
    } as ScrapeResponse)
    expect(out).toMatch(/^## Feed\n\n# unsupported: elements\n# warning: links_unavailable\n\n/)
  })

  it('prints no unsupported line when the list is empty', () => {
    expect(renderScrapeText({ ...base, unsupported_fields: [] })).not.toContain('unsupported')
  })

  it('shows elements_truncated like any other warning', () => {
    const out = renderScrapeText({
      ...base,
      elements: { books: [] },
      warnings: ['elements_truncated'],
    } as ScrapeResponse)
    expect(out).toContain('# warning: elements_truncated')
  })
})

describe('elements end to end (via mocked fetch)', () => {
  let tempCfg: string
  const ORIG_KEY = process.env.CRAWLBRULEE_API_KEY

  beforeEach(async () => {
    tempCfg = await mkdtemp(join(tmpdir(), 'crawlbrulee-cli-'))
    process.env.XDG_CONFIG_HOME = tempCfg
    delete process.env.CRAWLBRULEE_API_KEY
  })

  afterEach(async () => {
    delete process.env.XDG_CONFIG_HOME
    if (ORIG_KEY === undefined) delete process.env.CRAWLBRULEE_API_KEY
    else process.env.CRAWLBRULEE_API_KEY = ORIG_KEY
    await rm(tempCfg, { recursive: true, force: true })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends extract.elements to /api/scrape and passes elements through in json', async () => {
    const result = {
      url: 'https://books.toscrape.com/',
      requested_url: 'https://books.toscrape.com/',
      elements: { heading: 'All products', next_page: null },
    }
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(result), { status: 200, headers: JSON_HEADERS })
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await runScrapeUrl('https://books.toscrape.com/', {
      ...AUTH,
      element: ['heading=h1'],
      elements:
        '{"next_page": {"selector": "li.next a", "output": "attribute", "attribute": "href"}}',
      json: true,
    })

    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(calledUrl).toBe('https://staging-api.example.com/api/scrape')
    expect(JSON.parse(init.body as string)).toEqual({
      url: 'https://books.toscrape.com/',
      extract: {
        metadata: true,
        markdown: false,
        cleaned_html: false,
        elements: {
          next_page: { selector: 'li.next a', output: 'attribute', attribute: 'href' },
          heading: 'h1',
        },
      },
    })
    const out = writeSpy.mock.calls.map(c => String(c[0])).join('')
    expect(JSON.parse(out)).toMatchObject({ elements: result.elements })
  })

  it('sends extract.elements to /api/scrape/async with --async', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ job_id: 'job_el' }), { status: 200, headers: JSON_HEADERS })
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await runScrapeUrl('https://books.toscrape.com/', {
      ...AUTH,
      async: true,
      element: ['heading=h1'],
      json: true,
    })

    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(calledUrl).toBe('https://staging-api.example.com/api/scrape/async')
    const body = JSON.parse(init.body as string) as { extract?: { elements?: unknown } }
    expect(body.extract?.elements).toEqual({ heading: 'h1' })
  })

  it('sends a __proto__ name in the request body', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ url: 'https://books.toscrape.com/', elements: {} }), {
          status: 200,
          headers: JSON_HEADERS,
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await runScrapeUrl('https://books.toscrape.com/', {
      ...AUTH,
      element: ['__proto__=h1'],
      json: true,
    })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.body as string).toContain('"elements":{"__proto__":"h1"}')
  })

  it('a second --elements on the command line fails before any request is made', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit')
    }) as never)

    const program = new Command().exitOverride()
    registerScrapeCommand(program)
    await expect(
      program.parseAsync(
        [
          'scrape',
          'url',
          'https://books.toscrape.com/',
          '--api-key',
          AUTH.apiKey,
          '--api-url',
          AUTH.apiUrl,
          '--elements',
          '{"a": "h1"}',
          '--elements',
          '{"b": "h2"}',
        ],
        { from: 'user' }
      )
    ).rejects.toThrow('process.exit')

    const err = stderrSpy.mock.calls.map(c => String(c[0])).join('')
    expect(err).toContain('--elements is given more than once')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a bad --element fails before any request is made', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      runScrapeUrl('https://books.toscrape.com/', { ...AUTH, element: ['h1'] })
    ).rejects.toThrow(/invalid --element/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('scrape result shows the elements of an async job in text mode', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            url: 'https://books.toscrape.com/',
            requested_url: 'https://books.toscrape.com/',
            markdown: '# books',
            elements: { heading: 'All products' },
          }),
          { status: 200, headers: JSON_HEADERS }
        )
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await runScrapeResult('job_el', { ...AUTH, text: true })

    const out = writeSpy.mock.calls.map(c => String(c[0])).join('')
    expect(out).toContain('elements: {\n  "heading": "All products"\n}')
  })
})
