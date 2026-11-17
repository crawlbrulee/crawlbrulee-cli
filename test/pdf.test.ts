import { describe, expect, it } from 'vitest'

import { buildAsyncScrapeRequest, buildScrapeRequest } from '../src/commands/scrape.js'
import { renderScrapeText } from '../src/output/render-scrape.js'
import { parsePdfFlag, PdfParseError } from '../src/parsers/pdf.js'
import type { CliScrapeResponse } from '../src/sdk-pending.js'

describe('parsePdfFlag', () => {
  it.each([[undefined], [true], ['']])('a bare --pdf (%s) sends {} to take every default', raw => {
    expect(parsePdfFlag(raw)).toEqual({})
  })

  it('reads each word into its option, in any order', () => {
    expect(parsePdfFlag('print,landscape,letter,pages')).toEqual({
      layout: 'pages',
      paper: 'letter',
      landscape: true,
      media: 'print',
    })
  })

  it('accepts single and single_page for one long page', () => {
    expect(parsePdfFlag('single')).toEqual({ layout: 'single_page' })
    expect(parsePdfFlag('single_page,screen')).toEqual({ layout: 'single_page', media: 'screen' })
  })

  it('is case-insensitive and trims spaces', () => {
    expect(parsePdfFlag(' A4 , Print ')).toEqual({ paper: 'a4', media: 'print' })
  })

  it('refuses an unknown word and names the words it takes', () => {
    expect(() => parsePdfFlag('a3')).toThrow(PdfParseError)
    expect(() => parsePdfFlag('a3')).toThrow(/invalid --pdf value 'a3'.*letter/)
  })

  it('refuses an empty word', () => {
    expect(() => parsePdfFlag('a4,')).toThrow(/empty value/)
  })

  it.each([
    ['a4,letter', 'paper'],
    ['pages,single', 'layout'],
    ['screen,print', 'media'],
    ['landscape,landscape', 'landscape'],
  ])('refuses %s: the %s is given twice', (raw, option) => {
    expect(() => parsePdfFlag(raw)).toThrow(new RegExp(`gives the ${option} more than once`))
  })

  it.each([['single,a4'], ['single,letter'], ['single,landscape']])(
    'refuses %s: paper and landscape only go with pages',
    raw => {
      expect(() => parsePdfFlag(raw)).toThrow(PdfParseError)
    }
  )
})

describe('buildScrapeRequest — --pdf', () => {
  it('--pdf alone replaces the markdown default: pdf + metadata only', () => {
    const body = buildScrapeRequest('https://example.com', { pdf: true })
    expect(body.extract).toEqual({
      metadata: true,
      pdf: {},
      markdown: false,
      cleaned_html: false,
    })
  })

  it('--pdf --no-metadata asks for the pdf alone', () => {
    const body = buildScrapeRequest('https://example.com', { pdf: true, metadata: false })
    expect(body.extract).toEqual({
      metadata: false,
      pdf: {},
      markdown: false,
      cleaned_html: false,
    })
  })

  it('--pdf with words sends those options only', () => {
    const body = buildScrapeRequest('https://example.com', { pdf: 'letter,landscape' })
    expect(body.extract?.pdf).toEqual({ paper: 'letter', landscape: true })
  })

  it('--pdf with -m keeps the markdown', () => {
    const body = buildScrapeRequest('https://example.com', { pdf: true, markdown: true })
    expect(body.extract).toMatchObject({ markdown: true, pdf: {} })
  })

  it('--pdf with -ss asks for both', () => {
    const body = buildScrapeRequest('https://example.com', { pdf: 'single', screenshot: 'dark' })
    expect(body.extract).toMatchObject({
      pdf: { layout: 'single_page' },
      screenshot: { type: 'full_page', color_scheme: 'dark' },
      markdown: false,
    })
  })

  it('--all leaves the pdf out', () => {
    const body = buildScrapeRequest('https://example.com', { all: true })
    expect(body.extract).not.toHaveProperty('pdf')
  })

  it('--all --pdf adds the pdf to every other output', () => {
    const body = buildScrapeRequest('https://example.com', { all: true, pdf: 'print' })
    expect(body.extract).toMatchObject({
      markdown: true,
      cleaned_html: true,
      screenshot: { type: 'full_page' },
      pdf: { media: 'print' },
    })
  })

  it('leaves the pdf out when the flag is not given', () => {
    const body = buildScrapeRequest('https://example.com', {})
    expect(body.extract).not.toHaveProperty('pdf')
  })

  it('the async request carries the pdf too', () => {
    const body = buildAsyncScrapeRequest('https://example.com', { pdf: 'a4' })
    expect(body.extract?.pdf).toEqual({ paper: 'a4' })
  })

  it('a bad --pdf value fails before any request', () => {
    expect(() => buildScrapeRequest('https://example.com', { pdf: 'single,landscape' })).toThrow(
      PdfParseError
    )
  })
})

describe('renderScrapeText — pdf', () => {
  const base = (): CliScrapeResponse => ({
    url: 'https://example.com/report',
    requested_url: 'https://example.com/report',
    page_status_code: 200,
    metadata: { title: 'Report' },
    response_meta: {
      usage: {
        total_credit_cost: 5,
        engine_credit_cost: 5,
        proxy_multiplier: 1,
        screenshot_slicing_credit_cost: 0,
        zero_data_retention_credit_cost: 0,
        engine: 'screenshot',
        proxy: 'basic',
      },
    },
  })

  it('prints the pdf link the way the screenshot link is printed', () => {
    const out = renderScrapeText({
      ...base(),
      pdf: { url: 'https://cdn.example.com/report.pdf?token=t', bytes: 48213 },
    })
    expect(out).toBe(
      '## Report\n\npdf: https://cdn.example.com/report.pdf?token=t\n\n# usage: 5 credits · engine screenshot · proxy basic · slices 0'
    )
  })

  it('prints the pdf link right after the screenshot link', () => {
    const out = renderScrapeText({
      ...base(),
      screenshot: {
        url: 'https://cdn.example.com/shot.png',
        type: 'full_page',
        properties: {
          file_name: 'shot.png',
          mime: 'image/png',
          width: 1280,
          height: 4000,
          viewport: { width: 1280, height: 800, device_scale_factor: 1 },
        },
      },
      pdf: { url: 'https://cdn.example.com/report.pdf', bytes: 1200 },
    })
    expect(out).toContain(
      'screenshot: https://cdn.example.com/shot.png\npdf: https://cdn.example.com/report.pdf'
    )
  })

  it('prints the pdf warnings when the pdf could not be made', () => {
    const out = renderScrapeText({
      ...base(),
      markdown: '# Report',
      warnings: ['pdf_unavailable', 'pdf_single_page_overflow'],
    })
    expect(out).not.toContain('pdf:')
    expect(out).toContain('# warning: pdf_unavailable')
    expect(out).toContain('# warning: pdf_single_page_overflow')
  })
})
