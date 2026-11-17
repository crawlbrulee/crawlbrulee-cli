import type {
  AsyncScrapeRequest,
  MapEntries,
  MapLinkItem,
  MapLinkType,
  MapRequest,
  MapResponse,
  MapTruncation,
  PdfLayout,
  PdfMedia,
  PdfPaper,
  PdfRequest,
  PdfResult,
  ScrapeRequest,
  ScrapeResponse,
  ScreenshotColorScheme,
  ScreenshotRequest,
} from '@crawlbrulee/sdk'

/*
 * The cli's names for the pdf, the screenshot color scheme and the map's new
 * fields. The leaf types now come from the sdk (1.5.0); the Cli* shapes below
 * are kept so the commands keep their names. Later: use the sdk types directly
 * and remove this file.
 */

export type { MapEntries, MapLinkType, PdfLayout, PdfMedia, PdfPaper, PdfRequest, PdfResult }

export type ColorScheme = ScreenshotColorScheme

export type CliScreenshotRequest = ScreenshotRequest & { color_scheme?: ColorScheme }

export type CliScrapeExtract = Omit<NonNullable<ScrapeRequest['extract']>, 'screenshot'> & {
  screenshot?: CliScreenshotRequest
  pdf?: PdfRequest
}

export type CliScrapeRequest = Omit<ScrapeRequest, 'extract'> & { extract?: CliScrapeExtract }
export type CliAsyncScrapeRequest = Omit<AsyncScrapeRequest, 'extract'> & {
  extract?: CliScrapeExtract
}

export type CliScrapeResponse = ScrapeResponse & { pdf?: PdfResult }

/** The map request fields the sdk floor does not type yet. */
export type CliMapRequest = MapRequest & {
  /** The most entries the map finds. The new name of `max_urls`. */
  max_results?: number
  /** Start from this sitemap file, on the same site or on a host its robots.txt names. */
  sitemap_url?: string
  /** How many levels of nested sitemaps to follow. The api checks the maximum. */
  depth?: number
  entries?: MapEntries
  /** An ISO 8601 date and time with a time zone. */
  modified_since?: string
}

/** A map link: every link carries `type` and `lastmod`. */
export type CliMapLinkItem = MapLinkItem & {
  type: MapLinkType
  /** The sitemap's date for the entry, in UTC, or null when it gives none. */
  lastmod: string | null
}

export type CliMapDiscoveryCapReason =
  'max_results' | 'time' | 'file_budget' | 'depth' | 'file_size' | 'unread_files'

export type CliMapTruncation = Omit<MapTruncation, 'discovery_cap_reason'> & {
  total_before_max_results: number
  /** The sitemap files this call knew about but did not read whole. */
  unread_sitemaps: string[]
  discovery_cap_reason: CliMapDiscoveryCapReason | null
}

export type CliMapResponse = Omit<MapResponse, 'links' | 'response_meta'> & {
  links: CliMapLinkItem[]
  response_meta: Omit<MapResponse['response_meta'], 'truncation'> & {
    truncation: CliMapTruncation
  }
}
