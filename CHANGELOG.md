# Changelog

## 3.1.0 (2026-07-14)

Tracks a wave of server-side behavior changes. No flags were removed or renamed.

### Changed

- **Requires `@crawlbrulee/sdk` `^0.6.0`** (built against the updated response contract).
- **Default proxy tier is now `auto`.** When you omit `--proxy`, the server starts on the
  `basic` tier and escalates to `advanced` on failure (was `basic`-only). Pass
  `--proxy basic|advanced|auto` to pin a tier explicitly. Nothing changes if you already
  pass `--proxy`.
- **Custom screenshot viewport is bounded.** `-ss <mode>,<width>,<height>` now rejects a
  width/height outside `16–10000` up front with a clear message, instead of round-tripping
  to a server `400`.

### Added

- **Legacy token masking.** `view-config`/`whoami` mask the current `cwbl_` prefix and the
  legacy `cble_` prefix identically (old keys still authenticate).

### Notes

- **Screenshots.** In the rare case a screenshot can't be captured, you still get everything
  else you requested and the response leaves out the `screenshot` field. An absent screenshot
  simply renders nothing.
- **API token prefix** is `cwbl_` (prod) / `cwbl_staging_` (staging). Existing `cble_`
  tokens keep working — no action needed.
- **`--images`** now returns absolute URLs: relative `src`s resolve against the full page
  URL and query strings are preserved.
- **Rate limits are per-plan**, with separate per-minute buckets for sync and async work
  (sync `scrape url` and `map` share the sync bucket; `scrape url --async` uses the async
  bucket): Free 50/100, Starter 100/300, Pro 350/1000, Advanced 1000/3000 (sync/async).

## 3.0.0 (2026-07-13)

### Breaking

- **`scrape` is now a command group.** Scraping a URL moved from
  `crawlbrulee scrape <url>` to **`crawlbrulee scrape url <url>`**. Update any scripts and
  aliases. This frees the `scrape` namespace for the new async-job subcommands below.

### Added

- **`crawlbrulee scrape status <job-id>`** — look up an async job's state (`pending` /
  `running` / `done` / `failed`), with the `response_meta.usage` envelope once `done` and an
  `# error: …` line on failure.
- **`crawlbrulee scrape result <job-id>`** — fetch the result of a completed async job
  (rendered like a synchronous scrape); errors if the job isn't finished yet.
- **`crawlbrulee scrape wait <job-id>`** — poll a job to completion and print the result
  (the `wait_for_scrape` equivalent), with `--interval <seconds>` (default 2) and
  `--timeout <seconds>` (default 300; `0` = wait forever). Prints a single `waiting for
job …` note to stderr in a terminal; Ctrl-C cancels.
- **`crawlbrulee scrape url <url> --async --wait`** — submit a background job and wait for
  its result in one command, reusing `--interval`/`--timeout`.

## 2.0.0 (2026-07-03)

### Breaking

- **`response_meta.usage` envelope.** Scrape and map responses now carry a
  `response_meta.usage` object — `{ credits, proxy, cache_hit }`. In text mode the CLI
  prints it as a trailing `# usage: <credits> credits · proxy <tier> · cache_hit <bool>`
  comment; in JSON it is passed through verbatim. `credits` is `0` on a cache
  hit and `proxy` is the **resolved** tier actually used (`none` | `basic` |
  `advanced`, never `auto`). The map response's `response_meta` also carries the
  `pagination`/`truncation` blocks.

> Scrape page metadata is read from `metadata` (the per-page title/description/
> OG/Twitter block) — unchanged from the original contract. The async webhook
> echo flag is likewise unchanged: `--webhook-metadata` populates the request's
> `webhook.metadata` field and is returned verbatim in the webhook payload's
> `data.metadata`.
>
> Requires `@crawlbrulee/sdk` built against the new response contract
> (`response_meta.usage`). The matching SDK release is not yet published.
