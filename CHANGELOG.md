# changelog

all notable changes to the `crawlbrulee` cli are documented here.

this project follows [Semantic Versioning](https://semver.org). breaking changes — renamed or removed commands and flags — land in major releases.

## 3.2.2 (2026-08-14)

### added

- **a hint for `service_unavailable`** — the error line now ends in
  `(temporary — safe to retry)`. the api answers a transient backend failure with a `503`
  under this name, where it used to answer `401 invalid_credentials`, which read as "your key
  is bad" and invited a pointless key rotation. the hint says plainly that the key is fine and
  the call is worth retrying.

### fixed

- **`crawlbrulee --version` reports the real version again.** `CLI_VERSION` is a literal kept
  in step with `package.json` by hand, and 3.2.1 shipped without moving it — so every 3.2.1
  install answered `3.2.0`, and bug reports carried a version that was never the one running.
  a test now compares the two, the same guard the js and python sdks already carry.

### changed

- **`@crawlbrulee/sdk` moved to `^0.11.0`** (from `^0.10.0`), picking up
  `ServiceUnavailableError` and the `ScrapeWarningCode` union. a `^` range on a `0.x`
  dependency pins the minor, so this had to move by hand.

### docs

- the warnings section names every code the api can return — `screenshot_truncated`,
  `links_truncated`, `inline_images_truncated`, `raw_html_truncated`, `metadata_truncated` —
  and what each one means for the payload, so a `# warning:` line is readable without a docs
  lookup. `links_truncated` / `inline_images_truncated` mean those arrays are incomplete;
  `raw_html_truncated` means the html is cut at a tag boundary, never mid-tag.
- the warnings section gains the `*_unavailable` family — `links_unavailable`,
  `inline_images_unavailable`, `metadata_unavailable` — which mean that section's extraction
  failed and the field came back omitted or empty while the rest of the scrape succeeded. an
  empty array carrying one of these is not a page that had none. it also records that warnings
  are stored with the result, so cache hits and `result` fetches print them too, filtered to the
  outputs you asked for — the readme previously said they appeared on fresh scrapes only.
- `--links`, `--images` and `--raw-html` carry their per-page caps (30,000 links, 10,000 inline
  images, 10,000,000 characters of page body) instead of promising "all".
- the `-ss` section documents the capture limits: a full-page capture scrolls up to 15,000px
  (past that you get the top of the page plus a `screenshot_truncated` warning), and slicing
  returns at most 20 slices, with the last slice carrying the remainder.
- the errors section gains a `service_unavailable` example and spells out what the exit code
  does and does not tell you: it is `1` on any failure, so a script that needs to tell a
  retryable failure from a permanent one has to read the error name.

## 3.2.1 (2026-08-03)

### changed

- moves to `@crawlbrulee/sdk` `^0.10.0`, which drops `overage_hard_cap` from
  `UsageAllocationReason`. the api now reports every credit-exhaustion refusal as
  `credit_limit`. no command, flag, or json output changes — the cli never printed the
  reason code on its own, so this only keeps the sdk floor current.

## 3.2.0 (2026-07-28)

### changed

- moves to `@crawlbrulee/sdk` `^0.9.0`, which types the `requested_url` response field (the
  url you requested, echoed verbatim, alongside `url` — the url actually scraped, after
  redirects, in cleaned canonical form) and names the `unsupported_screenshot_output` error.
  the cli passes both through in `--json` output; no flags changed.

### docs

- corrected the cache-billing wording: `credits` is `0` on a **fully cached** result — parts
  still computed fresh (e.g. a newly produced screenshot-slice variant) are charged.
- corrected the screenshot-failure claim: when a screenshot can't be captured you still get
  the other outputs you requested, with the `screenshot` field left out — but a
  screenshot-only call errors with `unsupported_screenshot_output` instead, and isn't
  charged.

## 3.1.3 (2026-07-19)

### changed

- internal: the cli is now built with tsdown (previously tsup) on TypeScript 6. no changes to
  commands, flags, or output.

## 3.1.2 (2026-07-15)

- moves to `@crawlbrulee/sdk` `^0.7.0`, whose proxy tier types now list exactly the supported
  tiers: `basic`, `advanced`, `auto` for `--proxy`, and `basic` | `advanced` for the resolved
  tier reported in `response_meta.usage.proxy`. no behaviour change — `--proxy` accepted the
  same values before.
- fixes `crawlbrulee --version`, which reported a stale version (it had drifted behind the
  released package).

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
  hit and `proxy` is the **resolved** tier actually used (`basic` | `advanced`,
  never `auto`). the map response's `response_meta` also carries the
  `pagination`/`truncation` blocks.

> scrape page metadata is read from `metadata` (the per-page title/description/
> OG/Twitter block) — unchanged from the original contract. the async webhook
> echo flag is likewise unchanged: `--webhook-metadata` populates the request's
> `webhook.metadata` field and is returned verbatim in the webhook payload's
> `data.metadata`.
>
> requires `@crawlbrulee/sdk` built against the new response contract
> (`response_meta.usage`) — shipped as `0.4.0`.
