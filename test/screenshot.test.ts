import { describe, expect, it } from 'vitest'

import { parseScreenshotFlag, ScreenshotParseError } from '../src/parsers/screenshot.js'

describe('parseScreenshotFlag', () => {
  describe('bare flag (no value)', () => {
    it('returns full_page when called with undefined', () => {
      expect(parseScreenshotFlag(undefined)).toEqual({ type: 'full_page' })
    })

    it('returns full_page when commander passes `true`', () => {
      expect(parseScreenshotFlag(true)).toEqual({ type: 'full_page' })
    })

    it('returns full_page for the empty string', () => {
      expect(parseScreenshotFlag('')).toEqual({ type: 'full_page' })
    })
  })

  describe('mode-only', () => {
    it('accepts "full" as an alias for "full_page"', () => {
      expect(parseScreenshotFlag('full')).toEqual({ type: 'full_page' })
    })

    it('accepts "full_page" as-is', () => {
      expect(parseScreenshotFlag('full_page')).toEqual({ type: 'full_page' })
    })

    it('accepts "viewport"', () => {
      expect(parseScreenshotFlag('viewport')).toEqual({ type: 'viewport' })
    })

    it('is case-insensitive', () => {
      expect(parseScreenshotFlag('VIEWPORT')).toEqual({ type: 'viewport' })
      expect(parseScreenshotFlag('Full_Page')).toEqual({ type: 'full_page' })
    })

    it('rejects invalid modes with a helpful error', () => {
      expect(() => parseScreenshotFlag('banana')).toThrow(/invalid screenshot mode 'banana'/)
      expect(() => parseScreenshotFlag('banana')).toThrow(ScreenshotParseError)
    })
  })

  describe('viewport dimensions', () => {
    it('parses width + height into viewport', () => {
      expect(parseScreenshotFlag('full,1920,1080')).toEqual({
        type: 'full_page',
        viewport: { width: 1920, height: 1080 },
      })
    })

    it('rejects width without height', () => {
      expect(() => parseScreenshotFlag('full,1920')).toThrow(/width given without height/)
    })

    it('rejects non-positive width', () => {
      expect(() => parseScreenshotFlag('full,0,1080')).toThrow(/invalid width '0'/)
      expect(() => parseScreenshotFlag('full,-1,1080')).toThrow(/invalid width '-1'/)
    })

    it('rejects non-integer width', () => {
      expect(() => parseScreenshotFlag('full,abc,1080')).toThrow(/invalid width 'abc'/)
      expect(() => parseScreenshotFlag('full,1.5,1080')).toThrow(/invalid width '1.5'/)
    })

    it('rejects viewport dimensions below the API minimum (16)', () => {
      expect(() => parseScreenshotFlag('full,15,1080')).toThrow(
        /invalid width '15' \(must be an integer between 16 and 10000\)/
      )
      expect(() => parseScreenshotFlag('full,1920,10')).toThrow(/invalid height '10'/)
    })

    it('rejects viewport dimensions above the API maximum (10000)', () => {
      expect(() => parseScreenshotFlag('full,10001,1080')).toThrow(/invalid width '10001'/)
      expect(() => parseScreenshotFlag('full,1920,10001')).toThrow(/invalid height '10001'/)
    })

    it('accepts the boundary values 16 and 10000', () => {
      expect(parseScreenshotFlag('full,16,10000')).toEqual({
        type: 'full_page',
        viewport: { width: 16, height: 10000 },
      })
    })
  })

  describe('device mode', () => {
    it('parses device after viewport', () => {
      expect(parseScreenshotFlag('full,1920,1080,mobile')).toEqual({
        type: 'full_page',
        viewport: { width: 1920, height: 1080 },
        device_mode: 'mobile',
      })
    })

    it('rejects unknown device values', () => {
      expect(() => parseScreenshotFlag('full,1920,1080,tablet')).toThrow(/invalid device 'tablet'/)
    })

    it('is case-insensitive', () => {
      expect(parseScreenshotFlag('full,1920,1080,MOBILE').device_mode).toBe('mobile')
    })
  })

  describe('slice-height (position 5)', () => {
    it('maps to actions_after.slice when given', () => {
      expect(parseScreenshotFlag('full,1280,720,desktop,800')).toEqual({
        type: 'full_page',
        viewport: { width: 1280, height: 720 },
        device_mode: 'desktop',
        actions_after: [{ type: 'slice', height: 800 }],
      })
    })

    it('rejects slice-height below the API minimum (500)', () => {
      expect(() => parseScreenshotFlag('full,1280,720,desktop,400')).toThrow(
        /slice-height must be ≥ 500/
      )
    })

    it('rejects non-positive slice-height', () => {
      expect(() => parseScreenshotFlag('full,1280,720,desktop,0')).toThrow(
        /invalid slice-height '0'/
      )
    })
  })

  describe('overall structure', () => {
    it('rejects more than 5 positions', () => {
      expect(() => parseScreenshotFlag('full,1920,1080,mobile,800,extra')).toThrow(
        /too many values for -ss \(max 5, got 6\)/
      )
    })
  })
})
