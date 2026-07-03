# 🍮 crawlbrulee CLI

The official command-line interface for the [crawlbrulee](https://crawlbrulee.com) web-scraping API. Scrape pages, map sites, and inspect your account from the terminal.

- `npx`-runnable — zero install.
- Wraps the [`@crawlbrulee/sdk`](https://www.npmjs.com/package/@crawlbrulee/sdk) under the hood; the CLI is just an argparse/formatter on top.
- TTY-aware output: text in a terminal, JSON when piped, both forceable.
- Auth via `crawlbrulee login`, `CRAWLBRULEE_API_KEY`, or a per-call `--api-key`.

> **Status:** v2.x. The command surface is stable; flag additions are minor-version bumps.

---

## Install

```bash
# one-off — recommended
npx crawlbrulee scrape https://example.com

# or install globally
npm install -g crawlbrulee
# pnpm add -g crawlbrulee
# yarn global add crawlbrulee
```

Once installed, `crawlbrulee` is on `$PATH`. Run `crawlbrulee --help` for the top-level summary or `crawlbrulee <command> --help` for any command.

## First-run flow

```bash
# 1. Save your key (paste it interactively, or pass --api-key)
crawlbrulee login

# 2. Sanity-check the resolved config (API key is masked)
crawlbrulee view-config

# 3. Scrape something
crawlbrulee scrape https://example.com
```

You can also skip `login` entirely and authenticate per-call:

```bash
export CRAWLBRULEE_API_KEY="cble_..."
crawlbrulee scrape https://example.com
```

---

## Commands

### `crawlbrulee scrape <url>`

Scrape a URL. Default extraction is `markdown + metadata`.

```bash
crawlbrulee scrape https://example.com                # markdown to stdout
crawlbrulee scrape https://example.com | jq .markdown # JSON when piped
crawlbrulee scrape https://example.com -c             # cleaned HTML
crawlbrulee scrape https://example.com --all          # every extract field at once
crawlbrulee scrape https://example.com -ss full       # full-page screenshot
crawlbrulee scrape https://example.com --proxy advanced --require-js
crawlbrulee scrape https://example.com -o out.json
```

Every scrape response carries a `response_meta.usage` envelope — `{ credits, proxy, cache_hit }` — where
`credits` is what the call cost (`0` on a cache hit), `proxy` is the **resolved** tier actually
used (`none` | `basic` | `advanced`, never `auto`), and `cache_hit` says whether the result came
from cache. In text mode this is printed as a trailing comment, e.g.
`# usage: 3 credits · proxy advanced · cache_hit false`; in JSON it's the `response_meta.usage` object.
Page metadata (title, OG/Twitter tags, etc.) is returned under `metadata`.

**Extract toggles** — pick one or more; if any are given they replace the default.

| Flag             | Short | Effect                                  |
| ---------------- | ----- | --------------------------------------- |
| `--markdown`     | `-m`  | extract markdown                        |
| `--cleaned-html` | `-c`  | extract main-content HTML               |
| `--raw-html`     | `-r`  | extract raw HTML                        |
| `--links`        | `-l`  | extract all links                       |
| `--images`       | `-i`  | extract inline images                   |
| `--screenshot`   | `-ss` | capture a screenshot (see syntax below) |
| `--all`          | —     | every extract field at once             |
| `--no-metadata`  | —     | omit page metadata from the response    |

**Screenshot syntax (`-ss` / `--screenshot`)** — positional, comma-separated:

```
-ss
-ss <mode>
-ss <mode>,<width>,<height>
-ss <mode>,<width>,<height>,<device>
-ss <mode>,<width>,<height>,<device>,<slice-height>
```

| Position | Values                              | Default              |
| -------- | ----------------------------------- | -------------------- |
| 1        | `viewport` \| `full` \| `full_page` | `full_page`          |
| 2        | width (positive int)                | server default       |
| 3        | height (positive int)               | server default       |
| 4        | `desktop` \| `mobile`               | `desktop`            |
| 5        | slice-height (≥ 500)                | none (no tile slice) |

`full` is a typeable shortcut for `full_page`. Positions are strictly left-to-right — to set position N you must also fill 1..N-1.

```bash
crawlbrulee scrape https://x.com -ss viewport
crawlbrulee scrape https://x.com -ss full,1920,1080
crawlbrulee scrape https://x.com -ss full,1920,1080,mobile
crawlbrulee scrape https://x.com -ss full,1280,720,desktop,800   # sliced
```

**Other scrape flags:**

```
--proxy <basic|advanced|auto|none>   default basic
--require-js                         render with a headless browser
--exclude-selectors "nav,footer"     CSS selectors stripped from the result
--cache-max-age 86400                cache cutoff in seconds
--locale en-US                       BCP-47 locale (Accept-Language + navigator.language)
--country US                         ISO 3166-1 alpha-2 country code (eu / europe also accepted)
-o, --output <file>                  write to a file instead of stdout
```

**Async (fire-and-forget) scrape**

Submit the scrape as a background job and get a `job_id` back immediately instead of
holding the connection open until the page is ready. Good for heavy JS rendering or
long-page screenshots. The CLI does **not** poll or wait — it prints the `job_id` and exits.

```
--async                              submit a background job; print the job_id and exit
--webhook-url <url>                  completion webhook endpoint (requires --async)
--webhook-metadata <json>            JSON object echoed back in the webhook (requires --webhook-url)
```

```bash
# submit and get a job id (text mode shows `job_id: <id>`)
crawlbrulee scrape https://example.com --async
# job_id: job_abc123

# get the job id as JSON for scripting
crawlbrulee scrape https://example.com --async --json | jq -r .job_id

# be notified when the job finishes, with correlation metadata echoed back
crawlbrulee scrape https://example.com --async \
  --webhook-url https://hooks.example.com/crawlbrulee \
  --webhook-metadata '{"order":"abc","attempt":2}'
```

The webhook is delivered as a single signed `scrape.complete` POST when the job reaches a
terminal state; `--webhook-metadata` must be a JSON **object** and is returned verbatim in
the webhook payload's `data.metadata`. Configure the signing secret in the dashboard
(Account → Webhooks). `--webhook-url`/`--webhook-metadata` require `--async`, and
`--webhook-metadata` requires `--webhook-url`; invalid JSON fails with a clear error.

### `crawlbrulee map <url>`

List URLs discovered on a site (sitemap + homepage crawl, deduped).

```bash
crawlbrulee map https://example.com
crawlbrulee map https://example.com --limit 500 --page 2
crawlbrulee map https://example.com --sitemap-only
crawlbrulee map https://example.com --internal-only --no-subdomains
crawlbrulee map https://example.com --external-only
crawlbrulee map https://example.com --country DE
crawlbrulee map https://example.com -o links.txt
```

| Flag                    | Effect                                                                     |
| ----------------------- | -------------------------------------------------------------------------- |
| `--limit <n>`           | URLs per page (API max 10000)                                              |
| `--page <n>`            | page number (1-indexed)                                                    |
| `--sitemap-only`        | skip homepage extraction, use `sitemap.xml` only                           |
| `--internal-only`       | same-domain links only                                                     |
| `--external-only`       | external-domain links only                                                 |
| `--no-subdomains`       | exclude subdomains from internal results                                   |
| `--proxy <tier>`        | `basic` \| `advanced` \| `auto` \| `none`                                  |
| `--cache-max-age <sec>` | cache cutoff in seconds                                                    |
| `--country <iso>`       | ISO 3166-1 alpha-2 country — proxy egress hint (eu / europe also accepted) |
| `-o, --output <file>`   | write to a file instead of stdout                                          |

The map response's `response_meta` carries the same `usage` envelope (`{ credits, proxy, cache_hit }`)
alongside its `pagination`/`truncation` blocks; text mode appends it as a `# usage: …` comment.

### `crawlbrulee usage`

Show the current billing-cycle usage and limits for the active API token.

```bash
crawlbrulee usage
crawlbrulee usage --json | jq .available_credits
```

### `crawlbrulee whoami`

Print the organization name and identifying preview of the active API token.

```bash
crawlbrulee whoami
```

### `crawlbrulee login` / `logout` / `view-config`

```bash
crawlbrulee login                          # prompt for key
crawlbrulee login --api-key cble_…         # non-interactive
crawlbrulee login --api-url https://staging-api.crawlbrulee.com
crawlbrulee logout                         # wipe stored credentials
crawlbrulee view-config                    # print resolved config (key masked)
```

---

## Auth and configuration

The CLI resolves credentials in this order for every request:

1. `--api-key` / `--api-url` flags
2. Environment: `CRAWLBRULEE_API_KEY` / `CRAWLBRULEE_API_URL`
3. Config file written by `crawlbrulee login`

Config file location:

| Platform | Path                                                        |
| -------- | ----------------------------------------------------------- |
| macOS    | `~/Library/Application Support/crawlbrulee/config.json`     |
| Linux    | `$XDG_CONFIG_HOME/crawlbrulee/config.json` or `~/.config/…` |
| Windows  | `%APPDATA%\crawlbrulee\config.json`                         |

POSIX hosts chmod the file to `0600` for secret hygiene. `XDG_CONFIG_HOME` is honored on every platform when set.

The default base URL is `https://api.crawlbrulee.com`. Override with `--api-url` or `CRAWLBRULEE_API_URL` only if you have a staging endpoint or a self-hosted gateway.

---

## Output convention

stdout is **TTY-aware**:

- Terminal (TTY) → **text** by default.
- Piped, redirected to a file, or `-o <file>` → **JSON** by default.
- Override with `--json` (force JSON) or `--text` (force human-readable).
- `--compact` produces one-line JSON (only meaningful with `--json`).
- Errors go to stderr, formatted as `error: <name> — <message>`.
- Exit code is `0` on success, `1` on any failure.

Examples:

```bash
crawlbrulee scrape https://example.com                  # markdown title + body
crawlbrulee scrape https://example.com | jq .links       # JSON automatically
crawlbrulee scrape https://example.com --json --compact  # single-line JSON to terminal
crawlbrulee map  https://example.com > links.txt         # JSON to a file
crawlbrulee map  https://example.com --text > links.txt  # newline-delimited URLs to a file
```

---

## Errors

Errors are surfaced from the underlying SDK and rendered with a short hint when one is available:

```
error: too_many_requests — please slow down (retry after 12000ms)
error: usage_allocation_error — out of credits (reason: credit_limit)
error: antibot_blocked — protected page (try --proxy advanced or --require-js)
error: invalid_url — not a valid URL
```

See the [SDK error reference](https://www.npmjs.com/package/@crawlbrulee/sdk#errors) for the exhaustive list of `errorName`s.

---

## Building from source

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

Tested on Node.js 20+. The CLI bundles to a single ESM entry with a `#!/usr/bin/env node` shebang.

## Related projects

- [`@crawlbrulee/sdk`](https://www.npmjs.com/package/@crawlbrulee/sdk) — the TypeScript / JavaScript SDK this CLI wraps.
- [crawlbrulee MCP server](https://github.com/crawlbrulee/crawlbrulee-mcp) — exposes the API as MCP tools for AI agents (uses the SDK).

---

## License

[AGPL-3.0-only](./LICENSE)
