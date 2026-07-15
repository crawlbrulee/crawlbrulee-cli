# changelog

all notable changes to the `crawlbrulee` cli are documented here.

this project follows [Semantic Versioning](https://semver.org). breaking changes — renamed or removed commands and flags — land in major releases.


## 3.1.1 (2026-07-14)

minor changes & adjustments to the README

## 3.1.0 (2026-07-14)

tracks a wave of server-side behavior changes. no flags were removed or renamed.

### changed

- **requires `@crawlbrulee/sdk` `^0.6.0`** (built against the updated response contract).
- **default proxy tier is now `auto`.** when you omit `--proxy`, the server starts on the
  `basic` tier and escalates to `advanced` on failure (was `basic`-only). pass
  `--proxy basic|advanced|auto` to pin a tier explicitly. nothing changes if you already
  pass `--proxy`.
- **custom screenshot viewport is bounded.** `-ss <mode>,<width>,<height>` now rejects a
  width/height outside `16–10000` up front with a clear message, instead of round-tripping
  to a server `400`.

### notes

- **screenshots.** in the rare case a screenshot can't be captured, you still get everything
  else you requested and the response leaves out the `screenshot` field. an absent screenshot
  renders nothing.
- **`--images`** now returns absolute urls: relative `src`s resolve against the full page
  url and query strings are preserved.

## 3.0.0 (2026-07-13)

### breaking

- **`scrape` is now a command group.** scraping a url moved from
  `crawlbrulee scrape <url>` to **`crawlbrulee scrape url <url>`**. update any scripts and
  aliases. this frees the `scrape` namespace for the new async-job subcommands below.

### added

- **`crawlbrulee scrape status <job-id>`** — look up an async job's state (`pending` /
  `running` / `done` / `failed`), with the `response_meta.usage` envelope once `done` and an
  `# error: …` line on failure.
- **`crawlbrulee scrape result <job-id>`** — fetch the result of a completed async job
  (rendered like a synchronous scrape); errors if the job isn't finished yet.
- **`crawlbrulee scrape wait <job-id>`** — poll a job to completion and print the result
  (the `wait_for_scrape` equivalent), with `--interval <seconds>` (default 2) and
  `--timeout <seconds>` (default 300; `0` = wait forever). prints a single `waiting for
job …` note to stderr in a terminal; Ctrl-C cancels.
- **`crawlbrulee scrape url <url> --async --wait`** — submit a background job and wait for
  its result in one command, reusing `--interval`/`--timeout`.

## 2.0.0 (2026-07-03)

### breaking

- **`response_meta.usage` envelope.** scrape and map responses now carry a
  `response_meta.usage` object — `{ credits, proxy, cache_hit }`. in text mode the cli
  prints it as a trailing `# usage: <credits> credits · proxy <tier> · cache_hit <bool>`
  comment; in json it is passed through verbatim. `credits` is `0` on a cache
  hit and `proxy` is the **resolved** tier actually used (`none` | `basic` |
  `advanced`, never `auto`). the map response's `response_meta` also carries the
  `pagination`/`truncation` blocks.

> scrape page metadata is read from `metadata` (the per-page title/description/
> OG/Twitter block) — unchanged from the original contract. the async webhook
> echo flag is likewise unchanged: `--webhook-metadata` populates the request's
> `webhook.metadata` field and is returned verbatim in the webhook payload's
> `data.metadata`.
>
> requires `@crawlbrulee/sdk` built against the new response contract
> (`response_meta.usage`) — shipped as `0.4.0`.
