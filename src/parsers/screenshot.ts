import type { ScreenshotRequest } from '@crawlbrulee/sdk'

export class ScreenshotParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScreenshotParseError'
  }
}

/** Subset of {@link ScreenshotRequest} that the CLI ever emits from `-ss`. */
export type ParsedScreenshot = Pick<
  ScreenshotRequest,
  'type' | 'viewport' | 'device_mode' | 'actions_after'
>

const MIN_SLICE_HEIGHT = 500
const SCREENSHOT_MODES = ['viewport', 'full', 'full_page'] as const
const DEVICE_MODES = ['desktop', 'mobile'] as const

// commander passes `true` for boolean-form invocations (bare `-ss`),
// or the string value for `-ss <value>`.
type ScreenshotFlagInput = string | boolean | undefined

export function parseScreenshotFlag(raw: ScreenshotFlagInput): ParsedScreenshot {
  if (raw === undefined || raw === true || raw === '') {
    return { type: 'full_page' }
  }
  if (typeof raw !== 'string') {
    throw new ScreenshotParseError('unexpected -ss value type')
  }

  const parts = raw.split(',').map(s => s.trim())
  if (parts.length > 5) {
    throw new ScreenshotParseError(`too many values for -ss (max 5, got ${parts.length})`)
  }

  // Positional fields: mode, width, height, device, slice-height.
  const result: ParsedScreenshot = { type: parseMode(parts[0] ?? '') }

  if (parts.length >= 2) {
    const widthRaw = required(parts[1], 'width is required when more than the mode is specified')
    const width = parsePositiveInt(widthRaw, 'width')

    if (parts.length < 3 || !parts[2]) {
      throw new ScreenshotParseError(
        'width given without height — both viewport dimensions must be provided'
      )
    }
    const height = parsePositiveInt(parts[2], 'height')

    result.viewport = { width, height }
  }

  if (parts.length >= 4) {
    const deviceRaw = required(parts[3], 'device is required when a value is given at position 4')
    result.device_mode = parseDevice(deviceRaw)
  }

  if (parts.length >= 5) {
    const sliceRaw = required(
      parts[4],
      'slice-height is required when a value is given at position 5'
    )
    const sliceHeight = parsePositiveInt(sliceRaw, 'slice-height')
    if (sliceHeight < MIN_SLICE_HEIGHT) {
      throw new ScreenshotParseError(`slice-height must be ≥ ${MIN_SLICE_HEIGHT}`)
    }
    result.actions_after = [{ type: 'slice', height: sliceHeight }]
  }

  return result
}

function required(value: string | undefined, message: string): string {
  if (!value) throw new ScreenshotParseError(message)
  return value
}

function parseMode(raw: string): 'viewport' | 'full_page' {
  if (!raw) return 'full_page'
  const lower = raw.toLowerCase()
  if (!SCREENSHOT_MODES.includes(lower as (typeof SCREENSHOT_MODES)[number])) {
    throw new ScreenshotParseError(
      `invalid screenshot mode '${raw}' (expected 'viewport', 'full', or 'full_page')`
    )
  }
  return lower === 'full' ? 'full_page' : (lower as 'viewport' | 'full_page')
}

function parseDevice(raw: string): 'desktop' | 'mobile' {
  const lower = raw.toLowerCase()
  if (!DEVICE_MODES.includes(lower as (typeof DEVICE_MODES)[number])) {
    throw new ScreenshotParseError(`invalid device '${raw}' (expected 'desktop' or 'mobile')`)
  }
  return lower as 'desktop' | 'mobile'
}

function parsePositiveInt(raw: string, label: string): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) {
    throw new ScreenshotParseError(`invalid ${label} '${raw}' (must be a positive integer)`)
  }
  return n
}
