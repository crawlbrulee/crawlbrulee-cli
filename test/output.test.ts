import type { MapResponse, ScrapeResponse } from '@crawlbrulee/sdk'
import {
  CrawlbruleeError,
  RateLimitError,
  UsageAllocationError,
  ValidationError,
  ZeroDataRetentionNotEnabledError,
} from '@crawlbrulee/sdk'
import { describe, expect, it } from 'vitest'

import { formatError } from '../src/output/errors.js'
import { renderMapText } from '../src/output/render-map.js'
import { renderJobStatusText, renderScrapeText } from '../src/output/render-scrape.js'
import { renderJson, resolveFormatMode } from '../src/output/tty.js'

describe('resolveFormatMode', () => {
  it('returns text when stdout is a TTY and no overrides', () => {
    expect(resolveFormatMode({}, { isTTY: true })).toBe('text')
  })

  it('returns json when stdout is piped and no overrides', () => {
    expect(resolveFormatMode({}, { isTTY: false })).toBe('json')
  })

  it('--json forces json even in TTY', () => {
    expect(resolveFormatMode({ json: true }, { isTTY: true })).toBe('json')
  })

  it('--text forces text even when piped', () => {
    expect(resolveFormatMode({ text: true }, { isTTY: false })).toBe('text')
  })
})

describe('renderJson', () => {
  it('pretty-prints by default', () => {
    expect(renderJson({ a: 1 }, {})).toBe('{\n  "a": 1\n}')
  })

  it('compact mode omits whitespace', () => {
    expect(renderJson({ a: 1 }, { compact: true })).toBe('{"a":1}')
  })
})

describe('renderScrapeText', () => {
  it('prints a title header followed by markdown body', () => {
    const out = renderScrapeText({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      markdown: '# Hello\n\nworld',
      metadata: { title: 'Example Domain' },
      response_meta: {
        usage: {
          total_credit_cost: 1,
          screenshot_slicing_credit_cost: 0,
          engine: 'http',
          proxy: 'basic',
          zero_data_retention_credit_cost: 0,
        },
      },
    })
    expect(out).toBe(
      '## Example Domain\n\n# Hello\n\nworld\n\n# usage: 1 credits · engine http · proxy basic · slices 0'
    )
  })

  it('appends a usage footer with credits, engine, resolved proxy, and slices', () => {
    const out = renderScrapeText({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      markdown: 'body',
      response_meta: {
        usage: {
          total_credit_cost: 6,
          screenshot_slicing_credit_cost: 1,
          engine: 'screenshot',
          proxy: 'basic',
          zero_data_retention_credit_cost: 0,
        },
      },
    })
    expect(out).toContain('# usage: 6 credits · engine screenshot · proxy basic · slices 1')
  })

  it('shows 0 credits and the cache engine on a cache hit', () => {
    const out = renderScrapeText({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      markdown: 'body',
      response_meta: {
        usage: {
          total_credit_cost: 0,
          screenshot_slicing_credit_cost: 0,
          engine: 'cache',
          proxy: 'basic',
          zero_data_retention_credit_cost: 0,
        },
      },
    })
    expect(out).toContain('# usage: 0 credits · engine cache · proxy basic · slices 0')
  })

  it('falls back to cleaned_html when no markdown is present', () => {
    const out = renderScrapeText({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      cleaned_html: '<p>hi</p>',
      response_meta: {
        usage: {
          total_credit_cost: 1,
          screenshot_slicing_credit_cost: 0,
          engine: 'http',
          proxy: 'basic',
          zero_data_retention_credit_cost: 0,
        },
      },
    })
    expect(out).toContain('<p>hi</p>')
  })

  it('shows the screenshot URL with slice count when sliced', () => {
    const out = renderScrapeText({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      markdown: 'body',
      screenshot: {
        url: 'https://cdn/x.png',
        type: 'full_page',
        properties: {
          file_name: 'x.png',
          mime: 'image/png',
          width: 1920,
          height: 5000,
          viewport: { width: 1920, height: 1080, device_scale_factor: 1 },
        },
        slices: [
          {
            row_nr: 0,
            url: 'https://cdn/s0.png',
            type: 'slice',
            properties: {
              file_name: 's0.png',
              mime: 'image/png',
              width: 1920,
              height: 800,
              viewport: { width: 1920, height: 1080, device_scale_factor: 1 },
            },
          },
        ],
      },
      response_meta: {
        usage: {
          total_credit_cost: 1,
          screenshot_slicing_credit_cost: 0,
          engine: 'http',
          proxy: 'basic',
          zero_data_retention_credit_cost: 0,
        },
      },
    })
    expect(out).toContain('screenshot: https://cdn/x.png (1 slices)')
    expect(out).toContain('- https://cdn/s0.png')
  })

  it('renders no screenshot line when the field is absent (screenshot not captured)', () => {
    // In rare cases a screenshot can't be captured; when that happens the response
    // leaves out the `screenshot` field entirely, so an absent screenshot simply
    // renders nothing.
    const res = {
      url: 'https://example.com',
      requested_url: 'https://example.com',
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
    } as unknown as ScrapeResponse
    const out = renderScrapeText(res)
    expect(out).not.toContain('screenshot')
    expect(out).toContain('body')
  })

  it('lists links when no body was requested', () => {
    const out = renderScrapeText({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      links: [{ text: 't', href: 'https://a', internal: true }],
      response_meta: {
        usage: {
          total_credit_cost: 1,
          screenshot_slicing_credit_cost: 0,
          engine: 'http',
          proxy: 'basic',
          zero_data_retention_credit_cost: 0,
        },
      },
    })
    expect(out).toContain('https://a')
  })

  it('appends warnings as comments', () => {
    const out = renderScrapeText({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      markdown: 'body',
      warnings: ['screenshot_truncated'],
      response_meta: {
        usage: {
          total_credit_cost: 1,
          screenshot_slicing_credit_cost: 0,
          engine: 'http',
          proxy: 'basic',
          zero_data_retention_credit_cost: 0,
        },
      },
    })
    expect(out).toContain('# warning: screenshot_truncated')
  })
})

describe('renderJobStatusText', () => {
  it('prints status, job_id, and created for a running job', () => {
    const out = renderJobStatusText({
      job_id: 'job_abc',
      status: 'running',
      created_at: '2026-07-13T10:00:00.000Z',
    })
    expect(out).toBe('status: running\njob_id: job_abc\ncreated: 2026-07-13T10:00:00.000Z')
  })

  it('appends an error line when the job failed', () => {
    const out = renderJobStatusText({
      job_id: 'job_bad',
      status: 'failed',
      created_at: '2026-07-13T10:00:00.000Z',
      error: 'upstream timeout',
    })
    expect(out).toContain('status: failed')
    expect(out).toContain('# error: upstream timeout')
  })

  it('appends a usage footer when the job is done', () => {
    const out = renderJobStatusText({
      job_id: 'job_done',
      status: 'done',
      created_at: '2026-07-13T10:00:00.000Z',
      response_meta: {
        usage: {
          total_credit_cost: 15,
          screenshot_slicing_credit_cost: 0,
          engine: 'browser',
          proxy: 'advanced',
          zero_data_retention_credit_cost: 0,
        },
      },
    })
    expect(out).toContain('status: done')
    expect(out).toContain('# usage: 15 credits · engine browser · proxy advanced · slices 0')
  })
})

describe('renderMapText', () => {
  it('prints one URL per line', () => {
    const out = renderMapText({
      links: [{ url: 'https://a' }, { url: 'https://b' }],
      response_meta: {
        pagination: { page: 1, limit: 10, total: 2, total_pages: 1, has_more: false },
        truncation: {
          storage_capped: false,
          response_capped: false,
          total_before_max_urls: 2,
          total_detected_before_storage_cap: 2,
        },
        usage: { total_credit_cost: 1, engine: 'http', proxy: 'basic' },
      },
    } as MapResponse)
    expect(out).toBe('https://a\nhttps://b\n\n# usage: 1 credits · engine http · proxy basic')
  })

  it('appends a pagination hint when has_more', () => {
    const out = renderMapText({
      links: [{ url: 'https://a' }],
      response_meta: {
        pagination: { page: 1, limit: 1, total: 3, total_pages: 3, has_more: true },
        truncation: {
          storage_capped: false,
          response_capped: false,
          total_before_max_urls: 3,
          total_detected_before_storage_cap: 3,
        },
        usage: { total_credit_cost: 1, engine: 'http', proxy: 'basic' },
      },
    } as MapResponse)
    expect(out).toContain('… and 2 more (use --page 2)')
  })

  it('appends a usage footer with credits, engine, and resolved proxy', () => {
    const out = renderMapText({
      links: [{ url: 'https://a' }],
      response_meta: {
        pagination: { page: 1, limit: 10, total: 1, total_pages: 1, has_more: false },
        truncation: {
          storage_capped: false,
          response_capped: false,
          total_before_max_urls: 1,
          total_detected_before_storage_cap: 1,
        },
        usage: { total_credit_cost: 1, engine: 'http', proxy: 'basic' },
      },
    } as MapResponse)
    expect(out).toContain('# usage: 1 credits · engine http · proxy basic')
    expect(out).not.toContain('slices')
  })
})

describe('formatError', () => {
  it('formats a ValidationError with name and message', () => {
    const err = new ValidationError('bad URL', {
      status: 400,
      errorName: 'invalid_url',
      response: { name: 'invalid_url', message: 'bad URL' },
    })
    expect(formatError(err)).toBe('error: invalid_url — bad URL')
  })

  it('adds a retry hint for too_many_requests when retry_after_ms is present', () => {
    const err = new RateLimitError('rate limited', {
      status: 429,
      details: { error_name: 'too_many_requests', retry_after_ms: 12000 },
      response: {
        name: 'too_many_requests',
        message: 'rate limited',
        details: { error_name: 'too_many_requests', retry_after_ms: 12000 },
      },
    })
    expect(formatError(err)).toBe('error: too_many_requests — rate limited (retry after 12000ms)')
  })

  it('adds a reason hint for usage_allocation_error', () => {
    const err = new UsageAllocationError('out of credits', {
      status: 429,
      details: { error_name: 'usage_allocation_error', reason: 'credit_limit' },
      response: {
        name: 'usage_allocation_error',
        message: 'out of credits',
        details: { error_name: 'usage_allocation_error', reason: 'credit_limit' },
      },
    })
    expect(formatError(err)).toBe(
      'error: usage_allocation_error — out of credits (reason: credit_limit)'
    )
  })

  it('does not suggest retry tactics for antibot_blocked', () => {
    const err = new ValidationError('blocked', {
      status: 403,
      errorName: 'antibot_blocked',
      response: { name: 'antibot_blocked', message: 'blocked' },
    })
    expect(formatError(err)).toBe('error: antibot_blocked — blocked')
  })

  it('does not suggest retry tactics for too_many_redirects', () => {
    // A redirect loop is the target's doing: no hint, like antibot_blocked.
    const err = new CrawlbruleeError('Target site redirected the request too many times.', {
      status: 422,
      errorName: 'too_many_redirects',
      response: {
        name: 'too_many_redirects',
        message: 'Target site redirected the request too many times.',
      },
    })
    expect(formatError(err)).toBe(
      'error: too_many_redirects — Target site redirected the request too many times.'
    )
  })

  it('does not suggest retry tactics for page_too_large', () => {
    // The page is too big to convert: terminal, so no hint — the same url
    // would fail the same way.
    const err = new CrawlbruleeError('The page is too large or too complex to convert.', {
      status: 422,
      errorName: 'page_too_large',
      response: {
        name: 'page_too_large',
        message: 'The page is too large or too complex to convert.',
      },
    })
    expect(formatError(err)).toBe(
      'error: page_too_large — The page is too large or too complex to convert.'
    )
  })

  it('adds a retry hint for service_unavailable', () => {
    const err = new CrawlbruleeError('backend unavailable', {
      status: 503,
      errorName: 'service_unavailable',
      response: { name: 'service_unavailable', message: 'backend unavailable' },
    })
    expect(formatError(err)).toBe(
      'error: service_unavailable — backend unavailable (temporary — safe to retry)'
    )
  })

  it('formats a generic Error', () => {
    expect(formatError(new Error('boom'))).toBe('error: boom')
  })

  it('formats non-Error values', () => {
    expect(formatError('weird string')).toBe('error: weird string')
  })
})

// Responses from the current api carry `page_status_code` and the
// `*_credit_cost` usage fields. The sdk this cli is built on does not type them
// yet, so these fixtures are cast. Older api responses leave them out; the
// tests above cover that shape.
const NEW_USAGE_404 = {
  total_credit_cost: 15,
  engine_credit_cost: 3,
  proxy_multiplier: 5,
  screenshot_slicing_credit_cost: 0,
  engine: 'browser',
  proxy: 'advanced',
}

describe('renderScrapeText — page status and new usage fields', () => {
  it('shows the page status in the usage footer when it is not 2xx', () => {
    const out = renderScrapeText({
      url: 'https://example.com/missing',
      requested_url: 'https://example.com/missing',
      page_status_code: 404,
      markdown: '# Page not found',
      metadata: { title: 'Page not found' },
      response_meta: { usage: NEW_USAGE_404 },
      warnings: [],
    } as unknown as ScrapeResponse)
    expect(out).toBe(
      '## Page not found\n\n# Page not found\n\n' +
        '# usage: 15 credits · engine browser · proxy advanced · slices 0 · page status 404'
    )
  })

  it('does not show the page status on a 2xx page', () => {
    const out = renderScrapeText({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      page_status_code: 200,
      markdown: 'body',
      response_meta: {
        usage: {
          total_credit_cost: 1,
          engine_credit_cost: 1,
          proxy_multiplier: 1,
          screenshot_slicing_credit_cost: 0,
          engine: 'http',
          proxy: 'basic',
        },
      },
    } as unknown as ScrapeResponse)
    expect(out).toContain('# usage: 1 credits · engine http · proxy basic · slices 0')
    expect(out).not.toContain('page status')
  })

  it('shows a 0-credit page the site answered with a 5xx', () => {
    const out = renderScrapeText({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      page_status_code: 503,
      markdown: 'down for maintenance',
      response_meta: {
        usage: {
          total_credit_cost: 0,
          engine_credit_cost: 0,
          proxy_multiplier: 1,
          screenshot_slicing_credit_cost: 0,
          engine: 'http',
          proxy: 'basic',
        },
      },
    } as unknown as ScrapeResponse)
    expect(out).toContain(
      '# usage: 0 credits · engine http · proxy basic · slices 0 · page status 503'
    )
  })

  it('reads total_credit_cost and screenshot_slicing_credit_cost over the deprecated names', () => {
    // The two always match on a real response; distinct values here prove
    // which one the footer reads.
    const out = renderScrapeText({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      page_status_code: 200,
      markdown: 'body',
      response_meta: {
        usage: {
          total_credit_cost: 26,
          engine_credit_cost: 5,
          proxy_multiplier: 5,
          screenshot_slicing_credit_cost: 1,
          engine: 'screenshot',
          proxy: 'advanced',
        },
      },
    } as unknown as ScrapeResponse)
    expect(out).toContain('# usage: 26 credits · engine screenshot · proxy advanced · slices 1')
  })

  it('leaves the credits and slices parts out when the usage has no cost fields', () => {
    const out = renderScrapeText({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      markdown: 'body',
      response_meta: {
        usage: {
          engine: 'screenshot',
          proxy: 'basic',
          zero_data_retention_credit_cost: 0,
        },
      },
    })
    expect(out).toContain('# usage: engine screenshot · proxy basic')
    expect(out).not.toContain('page status')
  })

  it('prints the page status on its own line when there is no usage object', () => {
    const out = renderScrapeText({
      url: 'https://example.com/gone',
      requested_url: 'https://example.com/gone',
      page_status_code: 410,
      markdown: 'gone',
    } as unknown as ScrapeResponse)
    expect(out).toBe('gone\n\n# page status 410')
  })

  it('ignores a page_status_code that is not an integer', () => {
    const out = renderScrapeText({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      page_status_code: '404',
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
    } as unknown as ScrapeResponse)
    expect(out).not.toContain('page status')
  })

  it('shows a 3xx final status (not 2xx) too', () => {
    const out = renderScrapeText({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      page_status_code: 304,
      markdown: 'body',
      response_meta: { usage: NEW_USAGE_404 },
    } as unknown as ScrapeResponse)
    expect(out).toContain('· page status 304')
  })
})

describe('renderJobStatusText — new usage fields', () => {
  it('reads total_credit_cost and screenshot_slicing_credit_cost when present', () => {
    const out = renderJobStatusText({
      job_id: 'job_done',
      status: 'done',
      created_at: '2026-07-13T10:00:00.000Z',
      response_meta: {
        usage: {
          total_credit_cost: 16,
          engine_credit_cost: 3,
          proxy_multiplier: 5,
          screenshot_slicing_credit_cost: 1,
          engine: 'browser',
          proxy: 'advanced',
        },
      },
    } as unknown as Parameters<typeof renderJobStatusText>[0])
    expect(out).toContain('# usage: 16 credits · engine browser · proxy advanced · slices 1')
  })
})

describe('renderMapText — new usage fields', () => {
  const pagination = { page: 1, limit: 10, total: 1, total_pages: 1, has_more: false }
  const truncation = {
    storage_capped: false,
    response_capped: false,
    total_before_max_urls: 1,
    total_detected_before_storage_cap: 1,
  }

  it('reads total_credit_cost over the deprecated credits', () => {
    const out = renderMapText({
      links: [{ url: 'https://a' }],
      response_meta: {
        pagination,
        truncation,
        usage: {
          total_credit_cost: 5,
          engine_credit_cost: 1,
          proxy_multiplier: 5,
          engine: 'http',
          proxy: 'advanced',
        },
      },
    } as unknown as MapResponse)
    expect(out).toBe('https://a\n\n# usage: 5 credits · engine http · proxy advanced')
  })

  it('shows a free empty map', () => {
    const out = renderMapText({
      links: [],
      response_meta: {
        pagination: { ...pagination, total: 0, total_pages: 0 },
        truncation,
        usage: {
          total_credit_cost: 0,
          engine_credit_cost: 0,
          proxy_multiplier: 1,
          engine: 'http',
          proxy: 'basic',
        },
      },
    } as unknown as MapResponse)
    expect(out).toContain('# usage: 0 credits · engine http · proxy basic')
  })
})

describe('formatError — target_unreachable', () => {
  it('prints the name, the message and a retry hint', () => {
    // The sdk this cli is built on has no dedicated class for this error yet,
    // so it arrives as a plain CrawlbruleeError carrying the name.
    const err = new CrawlbruleeError('Could not reach the target site.', {
      status: 502,
      errorName: 'target_unreachable' as never,
      response: {
        name: 'target_unreachable' as never,
        message: 'Could not reach the target site.',
      },
    })
    expect(formatError(err)).toBe(
      'error: target_unreachable — Could not reach the target site. (retrying later may help)'
    )
  })
})

describe('zero data retention — usage line', () => {
  const scrape = (cost: number | undefined): ScrapeResponse =>
    ({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      markdown: 'hi',
      response_meta: {
        usage: {
          total_credit_cost: 6,
          engine_credit_cost: 1,
          proxy_multiplier: 5,
          screenshot_slicing_credit_cost: 0,
          ...(cost === undefined ? {} : { zero_data_retention_credit_cost: cost }),
          engine: 'http',
          proxy: 'advanced',
        },
      },
    }) as ScrapeResponse

  it('adds +1 to the scrape usage line when the charge applied', () => {
    expect(renderScrapeText(scrape(1))).toContain(
      '# usage: 6 credits · engine http · proxy advanced · slices 0 · zero data retention +1'
    )
  })

  it('adds nothing when the charge is 0', () => {
    const out = renderScrapeText(scrape(0))
    expect(out).toContain('# usage: 6 credits · engine http · proxy advanced · slices 0')
    expect(out).not.toContain('zero data retention')
  })

  it('adds nothing when an older api leaves the field out', () => {
    expect(renderScrapeText(scrape(undefined))).not.toContain('zero data retention')
  })

  it('puts the +1 before the page status', () => {
    const res = { ...scrape(1), page_status_code: 404 } as ScrapeResponse
    expect(renderScrapeText(res)).toContain('slices 0 · zero data retention +1 · page status 404')
  })

  it('adds +1 to the finished job usage line', () => {
    const res = scrape(1)
    expect(
      renderJobStatusText({
        job_id: 'j1',
        status: 'done',
        response_meta: res.response_meta,
      } as never)
    ).toContain('zero data retention +1')
  })

  it('adds +1 to the map usage line', () => {
    const out = renderMapText({
      links: [{ url: 'https://a' }],
      response_meta: {
        pagination: { page: 1, limit: 10, total: 1, total_pages: 1, has_more: false },
        truncation: {
          storage_capped: false,
          response_capped: false,
          total_before_max_urls: 1,
          total_detected_before_storage_cap: 1,
        },
        usage: {
          total_credit_cost: 2,
          engine_credit_cost: 1,
          proxy_multiplier: 1,
          zero_data_retention_credit_cost: 1,
          engine: 'http',
          proxy: 'basic',
        },
      },
    } as MapResponse)
    expect(out).toContain('# usage: 2 credits · engine http · proxy basic · zero data retention +1')
  })
})

describe('formatError — zero_data_retention_not_enabled', () => {
  it('names the error and says what to do', () => {
    const message =
      'zero_data_retention is not enabled for your organization. Contact us to turn it on.'
    const err = new ZeroDataRetentionNotEnabledError(message, {
      status: 403,
      errorName: 'zero_data_retention_not_enabled',
      response: { name: 'zero_data_retention_not_enabled', message },
    })
    expect(formatError(err)).toBe(
      `error: zero_data_retention_not_enabled — ${message} (resend without --zero-data-retention, or ask us to turn it on for your organization)`
    )
  })
})
