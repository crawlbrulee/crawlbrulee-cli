# Changelog

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
