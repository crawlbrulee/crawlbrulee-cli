# Changelog

## Unreleased

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
