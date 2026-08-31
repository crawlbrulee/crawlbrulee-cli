import type { ApiErrorName, MapResponse, ScrapeResponse } from '@crawlbrulee/sdk'
import {
  CrawlbruleeError,
  RateLimitError,
  UsageAllocationError,
  ValidationError,
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
        usage: { credits: 1, engine: 'text', proxy: 'basic', screenshot_slices: 0 },
      },
    })
    expect(out).toBe(
      '## Example Domain\n\n# Hello\n\nworld\n\n# usage: 1 credits · engine text · proxy basic · slices 0'
    )
  })

  it('appends a usage footer with credits, engine, resolved proxy, and slices', () => {
    const out = renderScrapeText({
      url: 'https://example.com',
      requested_url: 'https://example.com',
      markdown: 'body',
      response_meta: {
        usage: { credits: 6, engine: 'screenshot', proxy: 'basic', screenshot_slices: 1 },
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
        usage: { credits: 0, engine: 'cache', proxy: 'basic', screenshot_slices: 0 },
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
        usage: { credits: 1, engine: 'text', proxy: 'basic', screenshot_slices: 0 },
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
        usage: { credits: 1, engine: 'text', proxy: 'basic', screenshot_slices: 0 },
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
        usage: { credits: 1, engine: 'text', proxy: 'basic', screenshot_slices: 0 },
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
        usage: { credits: 1, engine: 'text', proxy: 'basic', screenshot_slices: 0 },
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
        usage: { credits: 1, engine: 'text', proxy: 'basic', screenshot_slices: 0 },
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
        usage: { credits: 15, engine: 'browser', proxy: 'advanced', screenshot_slices: 0 },
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
        usage: { credits: 1, engine: 'text', proxy: 'basic' },
      },
    } as MapResponse)
    expect(out).toBe('https://a\nhttps://b\n\n# usage: 1 credits · engine text · proxy basic')
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
        usage: { credits: 1, engine: 'text', proxy: 'basic' },
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
        usage: { credits: 1, engine: 'text', proxy: 'basic' },
      },
    } as MapResponse)
    expect(out).toContain('# usage: 1 credits · engine text · proxy basic')
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

  it('adds a retry hint for service_unavailable', () => {
    // The cast goes away once the sdk floor types `service_unavailable` in
    // `ApiErrorName`; the cli already has to handle the 503 today.
    const errorName = 'service_unavailable' as ApiErrorName
    const err = new CrawlbruleeError('backend unavailable', {
      status: 503,
      errorName,
      response: { name: errorName, message: 'backend unavailable' },
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
