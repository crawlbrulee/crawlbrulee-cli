# 🍮 crawlbrulee cli

[![npm](https://img.shields.io/npm/v/crawlbrulee?style=flat-square&label=npm)](https://www.npmjs.com/package/crawlbrulee)
[![license](https://img.shields.io/npm/l/crawlbrulee?style=flat-square&label=license)](./LICENSE)

the official command-line interface for the [crawlbrulee](https://crawlbrulee.com) web-scraping api. scrape pages, map sites, and inspect your account from the terminal.

- `npx`-runnable — zero install.
- wraps [`@crawlbrulee/sdk`](https://www.npmjs.com/package/@crawlbrulee/sdk) — the cli is an argument parser and output formatter over the sdk.
- TTY-aware output: text in a terminal, json when piped, either forceable.
- authenticate with `crawlbrulee login`, `CRAWLBRULEE_API_KEY`, or a per-call `--api-key`.

this readme covers the cli itself — its commands, flags, and output. for how the api behaves — endpoints, parameters, and error semantics — please see our
[api docs](https://crawlbrulee.com/docs).

**get a free api key** → [dashboard.crawlbrulee.com](https://dashboard.crawlbrulee.com)

---

## install

```bash
# one-off — recommended
npx crawlbrulee scrape url https://example.com

# or install globally
npm install -g crawlbrulee
# pnpm add -g crawlbrulee
# yarn global add crawlbrulee
```

once installed, `crawlbrulee` is on `$PATH`. run `crawlbrulee --help` for the top-level summary or `crawlbrulee <command> --help` for any command.

## first-run flow

```bash
# 1. Save your key (paste it interactively, or pass --api-key)
crawlbrulee login

# 2. Sanity-check the resolved config (API key is masked)
crawlbrulee view-config

# 3. Scrape something
crawlbrulee scrape url https://example.com
```

you can also skip `login` entirely and authenticate per-call:

```bash
export CRAWLBRULEE_API_KEY="cwbl_..."
crawlbrulee scrape url https://example.com
```

---

## commands

### `crawlbrulee scrape url <url>`

scrape a url. default extraction is `markdown + metadata`.

```bash
crawlbrulee scrape url https://example.com                # markdown to stdout
crawlbrulee scrape url https://example.com | jq .markdown # JSON when piped
crawlbrulee scrape url https://example.com -c             # cleaned HTML
crawlbrulee scrape url https://example.com --all          # every extract field at once
crawlbrulee scrape url https://example.com -ss full       # full-page screenshot
crawlbrulee scrape url https://example.com --proxy advanced --require-js
crawlbrulee scrape url https://example.com -o out.json
```

every scrape response carries a `response_meta.usage` envelope — `{ credits, proxy, cache_hit }` — where
`credits` is what the call cost (`0` on a fully cached result — only parts still computed fresh,
e.g. a newly produced screenshot-slice variant, are charged), `proxy` is the **resolved** tier
actually used (`basic` | `advanced`, never `auto`), and `cache_hit` says whether the result came
from cache.

- in text mode this is printed as a trailing comment, e.g. `# usage: 3 credits · proxy advanced · cache_hit false`;
- in json it's the `response_meta.usage` object. page metadata (title, OG/Twitter tags, etc.) is returned under `metadata`. `url` is the url actually scraped (after redirects, in cleaned canonical form) and `requested_url` is the url you requested, echoed verbatim.

non-fatal notices ride along as `warnings` — in text mode they print as `# warning: <code>` lines, in json on the `warnings` array. an outsized page is truncated rather than refused, and the code says which part was cut:

| code                      | what it means for the payload                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `screenshot_truncated`    | the page was taller than the 15,000px scrolling-capture cap; you get the top of the page.        |
| `links_truncated`         | more than 30,000 links on the page — the `links` array is cut at the cap and is incomplete.      |
| `inline_images_truncated` | more than 10,000 inline images — the `images` array is cut at the cap and is incomplete.         |
| `raw_html_truncated`      | the page body exceeded 10,000,000 characters — the html is cut at a tag boundary, never mid-tag. |
| `metadata_truncated`      | the page head exceeded 2,000,000 characters — `metadata` can be missing tags past the cut.       |

a second family reports a section whose extraction failed outright — the field comes back omitted or empty while the rest of the scrape succeeds, so an empty array with one of these is not the same as a page that genuinely had none:

| code                        | what it means for the payload                                |
| --------------------------- | ------------------------------------------------------------ |
| `links_unavailable`         | link extraction failed — `links` is omitted or empty.        |
| `inline_images_unavailable` | image extraction failed — `images` is omitted or empty.      |
| `metadata_unavailable`      | metadata extraction failed — `metadata` is omitted or empty. |

the page body has no such code: if it can't be extracted the scrape fails outright rather than returning a hollow result, and isn't billed. warnings are stored with the result, so cache hits and `result` fetches report them too, filtered to the outputs you asked for.

and if you request an extract that doesn't apply to the content type (e.g. `markdown` of a pdf), the field name comes back in `unsupported_fields` with the rest of the payload still returned.

**extract toggles** — pick one or more; if any are given they replace the default.

| flag             | short | effect                                  |
| ---------------- | ----- | --------------------------------------- |
| `--markdown`     | `-m`  | extract markdown                        |
| `--cleaned-html` | `-c`  | extract main-content html               |
| `--raw-html`     | `-r`  | extract raw html                        |
| `--links`        | `-l`  | extract links (up to 30,000 per page)   |
| `--images`       | `-i`  | extract inline images (up to 10,000)    |
| `--screenshot`   | `-ss` | capture a screenshot (see syntax below) |
| `--all`          | —     | every extract field at once             |
| `--no-metadata`  | —     | omit page metadata from the response    |

`--images` returns absolute image urls — relative `src`s are resolved against the page url
and any query string is preserved. `--links` and `--images` are capped per page at 30,000 and
10,000 respectively, and `--raw-html` at 10,000,000 characters of page body; past a cap the
output is truncated and the response carries the matching warning code (see the warnings table
above). every extract field is documented under
[extraction](https://crawlbrulee.com/docs/scrape/extraction).

**screenshot syntax (`-ss` / `--screenshot`)** — positional, comma-separated:

```
-ss
-ss <mode>
-ss <mode>,<width>,<height>
-ss <mode>,<width>,<height>,<device>
-ss <mode>,<width>,<height>,<device>,<slice-height>
```

| position | values                              | default              |
| -------- | ----------------------------------- | -------------------- |
| 1        | `viewport` \| `full` \| `full_page` | `full_page`          |
| 2        | width (int, 16–10000)               | server default       |
| 3        | height (int, 16–10000)              | server default       |
| 4        | `desktop` \| `mobile`               | `desktop`            |
| 5        | slice-height (≥ 500)                | none (no tile slice) |

a full-page capture scrolls up to 15,000px. a taller page is captured to that height and the
response carries a `screenshot_truncated` warning (`# warning: screenshot_truncated` in text
mode), so you always know when you're looking at the top of a longer page. slicing returns at
most 20 slices — if your slice-height would produce more, the last slice carries the remainder
of the capture rather than the run being cut short.

in rare cases a screenshot can't be captured. if you requested other outputs too, you still get
them and the response leaves out the `screenshot` field; a screenshot-only call errors with
`unsupported_screenshot_output` instead, and you're not charged for it.

`full` is a typeable shortcut for `full_page`. positions are strictly left-to-right — to set position N you must also fill 1..N-1. a width or height outside `16–10000` is rejected up front with a clear message. full capture options: [screenshots](https://crawlbrulee.com/docs/scrape/screenshots).

```bash
crawlbrulee scrape url https://x.com -ss viewport
crawlbrulee scrape url https://x.com -ss full,1920,1080
crawlbrulee scrape url https://x.com -ss full,1920,1080,mobile
crawlbrulee scrape url https://x.com -ss full,1280,720,desktop,800   # sliced
```

**other scrape flags:**

```
--proxy <basic|advanced|auto>        default auto (basic tier first, escalates to advanced on failure)
--require-js                         render with a headless browser
--exclude-selectors "nav,footer"     CSS selectors stripped from the result
--cache-max-age 86400                cache cutoff in seconds
--locale en-US                       BCP-47 locale (Accept-Language + navigator.language)
--country US                         ISO 3166-1 alpha-2 country code (eu / europe also accepted)
-o, --output <file>                  write to a file instead of stdout
```

what each proxy tier does, and how `--country`/`--locale` steer egress, is documented under
[proxies & location](https://crawlbrulee.com/docs/proxies). `--cache-max-age` semantics are
covered in [caching](https://crawlbrulee.com/docs/scrape/caching). for the complete request
contract behind these flags, see the [scrape endpoint](https://crawlbrulee.com/docs/scrape)
reference.

**async scrape**

submit the scrape as a background job and get a `job_id` back immediately instead of
holding the connection open until the page is ready. good for heavy js rendering or
long-page screenshots. by default `--async` prints the `job_id` and exits; add `--wait` to
poll to completion and print the result in one command.

```
--async                              submit a background job (prints the job_id)
--wait                               with --async, poll until done and print the result
--interval <seconds>                 seconds between status polls while waiting (default 2)
--timeout <seconds>                  max seconds to wait (default 300; 0 = wait forever)
--webhook-url <url>                  completion webhook endpoint (requires --async)
--webhook-metadata <json>            JSON object echoed back in the webhook (requires --webhook-url)
```

```bash
# submit and get a job id (text mode shows `job_id: <id>`)
crawlbrulee scrape url https://example.com --async
# job_id: job_abc123

# get the job id as JSON for scripting
crawlbrulee scrape url https://example.com --async --json | jq -r .job_id

# submit, wait for it to finish, and print the result in one go
crawlbrulee scrape url https://example.com --async --wait
crawlbrulee scrape url https://example.com --async --wait --interval 5 --timeout 600

# be notified when the job finishes, with correlation metadata echoed back
crawlbrulee scrape url https://example.com --async \
  --webhook-url https://hooks.example.com/crawlbrulee \
  --webhook-metadata '{"order":"abc","attempt":2}'
```

the webhook is delivered as a single signed `scrape.complete` POST when the job reaches a
terminal state; `--webhook-metadata` must be a json **object** and is returned verbatim in
the webhook payload's `data.metadata`. configure the signing secret in the dashboard
(account → webhooks). `--wait` requires `--async` (and `--interval`/`--timeout` require
`--wait`); `--webhook-url`/`--webhook-metadata` require `--async`, and `--webhook-metadata`
requires `--webhook-url`; invalid json fails with a clear error.

the job lifecycle is documented under [async scrape](https://crawlbrulee.com/docs/scrape/async);
the delivery contract and payload shape under [webhooks](https://crawlbrulee.com/docs/scrape/webhooks),
with the signature scheme in [webhook verification](https://crawlbrulee.com/docs/webhook-verification).

### `crawlbrulee scrape status <job-id>`

look up the current state of an async job — `pending`, `running`, `done`, or `failed`.

```bash
crawlbrulee scrape status job_abc123
# status: running
# job_id: job_abc123
# created: 2026-07-13T10:00:00.000Z
```

when the job is `done`, the status carries the `response_meta.usage` envelope; when it
`failed`, an `# error: …` line explains why.

### `crawlbrulee scrape result <job-id>`

fetch the result of a completed async job. renders exactly like a synchronous `scrape url`.
if the job isn't finished yet, it errors — check `scrape status` first, or use `scrape wait`.

```bash
crawlbrulee scrape result job_abc123
crawlbrulee scrape result job_abc123 --json | jq .markdown
```

### `crawlbrulee scrape wait <job-id>`

poll an existing job until it reaches a terminal state, then print the result — the
`wait_for_scrape` equivalent for a `job_id` you already have.

```bash
crawlbrulee scrape wait job_abc123
crawlbrulee scrape wait job_abc123 --interval 5 --timeout 600   # poll every 5s, give up after 10m
crawlbrulee scrape wait job_abc123 --timeout 0                  # wait indefinitely
```

`--interval`/`--timeout` are in **seconds** (defaults: poll every 2s, time out after 300s;
`--timeout 0` waits forever). while waiting in a terminal it prints a one-line `waiting for
job …` note to stderr so stdout stays clean for piping; press Ctrl-C to cancel.

### `crawlbrulee map <url>`

list urls discovered on a site (sitemap + homepage crawl, deduped).

```bash
crawlbrulee map https://example.com
crawlbrulee map https://example.com --limit 500 --page 2
crawlbrulee map https://example.com --sitemap-only
crawlbrulee map https://example.com --internal-only --no-subdomains
crawlbrulee map https://example.com --external-only
crawlbrulee map https://example.com --country DE
crawlbrulee map https://example.com -o links.txt
```

| flag                    | effect                                                                     |
| ----------------------- | -------------------------------------------------------------------------- |
| `--limit <n>`           | urls per page (api max 10000)                                              |
| `--page <n>`            | page number (1-indexed)                                                    |
| `--sitemap-only`        | skip homepage extraction, use `sitemap.xml` only                           |
| `--internal-only`       | same-domain links only                                                     |
| `--external-only`       | external-domain links only                                                 |
| `--no-subdomains`       | exclude subdomains from internal results                                   |
| `--proxy <tier>`        | `basic` \| `advanced` \| `auto`                                            |
| `--cache-max-age <sec>` | cache cutoff in seconds                                                    |
| `--country <iso>`       | ISO 3166-1 alpha-2 country — proxy egress hint (eu / europe also accepted) |
| `-o, --output <file>`   | write to a file instead of stdout                                          |

the map response's `response_meta` carries the same `usage` envelope (`{ credits, proxy, cache_hit }`)
alongside its `pagination`/`truncation` blocks; text mode appends it as a `# usage: …` comment.
see the [map endpoint](https://crawlbrulee.com/docs/map) for discovery rules and pagination semantics.

### `crawlbrulee usage`

show the current billing-cycle usage and limits for the active api token.

```bash
crawlbrulee usage
# Total credits:      10000
# Used credits:       1243
# Available credits:  8757
# Used quota:         12.43%
# Max concurrency:    10
# Usage resets at:    2026-08-01T00:00:00.000Z

crawlbrulee usage --json | jq .available_credits
```

the json form carries `total_credits`, `used_credits`, `available_credits`, `used_quota_percent`, `max_concurrency`, and `usage_reset`. what a call costs, and how credits are counted, is documented under [credits & pricing](https://crawlbrulee.com/docs/credits-and-pricing).

### `crawlbrulee whoami`

print the organization name and token identity for the active api token — a quick way to confirm which key you're using.

```bash
crawlbrulee whoami
# Organization: Acme Inc
# Token name:   ci-bot
# Token:        cwbl_…AB12
```

json fields: `organization_name`, `token_name`, `token_preview`. the token is shown only as a masked preview — the full key is never echoed.

### `crawlbrulee login` / `logout` / `view-config`

```bash
crawlbrulee login                          # prompt for the key (input is hidden)
crawlbrulee login --api-key cwbl_…         # non-interactive
crawlbrulee login --api-url https://staging-api.crawlbrulee.com
crawlbrulee logout                         # remove stored credentials
crawlbrulee view-config                    # print the saved config (key masked)
```

`login` writes the key (and optional base url) to the config file and confirms with a masked line:

```
saved (api_key: cwbl_…AB12)
```

`view-config` prints the saved base url and masked key, and flags any environment variable that overrides the file:

```
api_url: https://api.crawlbrulee.com
api_key: cwbl_…AB12
# $CRAWLBRULEE_API_KEY is set in the environment — overrides config file
```

keys are masked as `<prefix>…<last-4>` — the full key is never echoed.

---

## auth and configuration

keys are minted in the dashboard; see [authentication](https://crawlbrulee.com/docs/authentication)
for how the api consumes them. the cli resolves credentials in this order for every request:

1. `--api-key` / `--api-url` flags
2. environment: `CRAWLBRULEE_API_KEY` / `CRAWLBRULEE_API_URL`
3. config file written by `crawlbrulee login`

config file location:

| platform | path                                                        |
| -------- | ----------------------------------------------------------- |
| macOS    | `~/Library/Application Support/crawlbrulee/config.json`     |
| Linux    | `$XDG_CONFIG_HOME/crawlbrulee/config.json` or `~/.config/…` |
| Windows  | `%APPDATA%\crawlbrulee\config.json`                         |

POSIX hosts chmod the file to `0600` for secret hygiene. `XDG_CONFIG_HOME` is honored on every platform when set.

the default base url is `https://api.crawlbrulee.com`. override with `--api-url` or `CRAWLBRULEE_API_URL` only if you have a staging endpoint or a self-hosted gateway.

---

## output convention

stdout is **TTY-aware**:

- terminal (TTY) → **text** by default.
- piped, redirected to a file, or `-o <file>` → **json** by default.
- override with `--json` (force json) or `--text` (force human-readable).
- `--compact` produces one-line json (only meaningful with `--json`).
- errors go to stderr, formatted as `error: <name> — <message>`.
- exit code is `0` on success, `1` on any failure.

examples:

```bash
crawlbrulee scrape url https://example.com               # markdown title + body
crawlbrulee scrape url https://example.com | jq .links   # JSON automatically
crawlbrulee scrape url https://example.com --json --compact  # single-line JSON to terminal
crawlbrulee map  https://example.com > links.txt         # JSON to a file
crawlbrulee map  https://example.com --text > links.txt  # newline-delimited URLs to a file
```

---

## errors

errors come from the sdk and from the cli's own validation. they go to stderr as
`error: <name> — <message>`, with a short actionable hint when one applies:

```
error: too_many_requests — please slow down (retry after 12000ms)
error: usage_allocation_error — out of credits (reason: credit_limit)
error: antibot_blocked — protected page
error: service_unavailable — backend unavailable (temporary — safe to retry)
error: invalid_url — not a valid URL
error: not logged in — run `crawlbrulee login` or set CRAWLBRULEE_API_KEY
```

`service_unavailable` (HTTP 503) is a transient backend failure, not a problem with your api
key — retry it with backoff rather than rotating credentials.

the exit code is `1` on any failure and `0` on success, so you can branch on it in scripts. it
tells you _that_ the call failed, not whether retrying will help: for that, read the error name.
`too_many_requests`, `request_timeout` and `service_unavailable` are worth retrying with backoff;
`invalid_credentials`, `invalid_url` and `validation_error` will fail the same way every time.
the name is the word right after `error:` on the stderr line, in `--json` and text mode alike.
the api docs carry the canonical [error reference](https://crawlbrulee.com/docs/errors) — every
error name, what causes it, and how to recover.

---

## building from source

```bash
git clone https://github.com/crawlbrulee/crawlbrulee-cli.git
cd crawlbrulee-cli
pnpm install
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm build        # tsup → dist/
./dist/index.js --help
```

tested on Node.js 22+. the cli bundles to a single ESM entry with a `#!/usr/bin/env node` shebang.

## part of the crawlbrulee toolkit

one api, many ways to call it:

- **[js/ts sdk](https://github.com/crawlbrulee/crawlbrulee-js)** — `@crawlbrulee/sdk` (the sdk this cli wraps)
- **[python sdk](https://github.com/crawlbrulee/crawlbrulee-py)** — `crawlbrulee` on pypi
- **[cli](https://github.com/crawlbrulee/crawlbrulee-cli)** — `npx crawlbrulee` (this one)
- **[mcp server](https://github.com/crawlbrulee/crawlbrulee-mcp)** — `@crawlbrulee/mcp`, for ai agents
- **[agent skills](https://github.com/crawlbrulee/crawlbrulee-skills)** — for skills-aware coding agents

docs: [crawlbrulee.com/docs](https://crawlbrulee.com/docs) · dashboard: [dashboard.crawlbrulee.com](https://dashboard.crawlbrulee.com)

---

## license

[AGPL-3.0-only](./LICENSE)
