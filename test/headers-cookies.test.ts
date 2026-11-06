import type { ScrapeResponse } from '@crawlbrulee/sdk'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildAsyncScrapeRequest,
  buildScrapeRequest,
  registerScrapeCommand,
  runScrapeUrl,
} from '../src/commands/scrape.js'
import { registerMapCommand } from '../src/commands/map.js'
import { renderScrapeText } from '../src/output/render-scrape.js'
import { hideUnknownOptionValue } from '../src/output/unknown-option.js'
import { parseCookiesFlags, parseHeadersFlags } from '../src/parsers/headers-cookies.js'

const JSON_HEADERS = { 'content-type': 'application/json' }
const AUTH = { apiKey: 'cwbl_test_key', apiUrl: 'https://staging-api.example.com' }
// A value that must never show up in any message.
const SECRET = 's3cr3t-token-value'

/** Run `fn`, expect it to throw, and return the message. */
function messageOf(fn: () => unknown): string {
  try {
    fn()
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err)
  }
  throw new Error('expected a throw')
}

describe('parseHeadersFlags — --header "Name: value"', () => {
  it('returns undefined when neither flag is given', () => {
    expect(parseHeadersFlags(undefined, undefined)).toBeUndefined()
    expect(parseHeadersFlags([], undefined)).toBeUndefined()
  })

  it('turns each --header into a name → value entry', () => {
    expect(
      parseHeadersFlags([`Authorization: Bearer ${SECRET}`, 'X-Tenant-Id: acme'], undefined)
    ).toEqual({ Authorization: `Bearer ${SECRET}`, 'X-Tenant-Id': 'acme' })
  })

  it('splits on the first colon only, so a value can hold colons', () => {
    expect(parseHeadersFlags(['Referer: https://example.com:8443/a'], undefined)).toEqual({
      Referer: 'https://example.com:8443/a',
    })
  })

  it('trims the space after the colon and around the name', () => {
    expect(parseHeadersFlags([' X-Api-Key :   abc '], undefined)).toEqual({ 'X-Api-Key': 'abc' })
    expect(parseHeadersFlags(['X-Api-Key:abc'], undefined)).toEqual({ 'X-Api-Key': 'abc' })
  })

  it('keeps an empty value, for the api to judge', () => {
    expect(parseHeadersFlags(['X-Empty:'], undefined)).toEqual({ 'X-Empty': '' })
  })

  it('rejects a value with no colon, without echoing it', () => {
    const msg = messageOf(() => parseHeadersFlags(['X-Ok: 1', `Bearer ${SECRET}`], undefined))
    expect(msg).toMatch(/invalid --header #2 \(must be "Name: value", with a colon\)/)
    expect(msg).not.toContain(SECRET)
  })

  it('rejects an empty name, without echoing the value', () => {
    const msg = messageOf(() => parseHeadersFlags([`: ${SECRET}`], undefined))
    expect(msg).toMatch(/invalid --header #1 \(the name before the colon is empty\)/)
    expect(msg).not.toContain(SECRET)
  })

  it('rejects the same name twice, ignoring case', () => {
    const msg = messageOf(() => parseHeadersFlags(['X-Key: a', `x-key: ${SECRET}`], undefined))
    expect(msg).toMatch(/header 'x-key' is given more than once/)
    expect(msg).not.toContain(SECRET)
  })
})

describe('a badly split flag never puts a secret on screen', () => {
  // A missing colon or `=` in the right place can leave part of the value in
  // the name. The api's 400 quotes the name, so the cli refuses such a name
  // itself, by position only.
  it('refuses a --header name that is not a valid header name', () => {
    const msg = messageOf(() => parseHeadersFlags([`Authorization Bearer ${SECRET}:x`], undefined))
    expect(msg).toMatch(/invalid --header #1 \(the name is not a valid header name\)/)
    expect(msg).not.toContain(SECRET)
  })

  it('refuses a --cookie name that is not a valid cookie name', () => {
    const msg = messageOf(() => parseCookiesFlags([`token ${SECRET}=x`], undefined))
    expect(msg).toMatch(/invalid --cookie #1 \(the name is not a valid cookie name\)/)
    expect(msg).not.toContain(SECRET)
  })

  it('refuses a --headers key that is not a valid header name', () => {
    const msg = messageOf(() =>
      parseHeadersFlags(undefined, JSON.stringify({ 'X-Ok': '1', [`Bearer ${SECRET}`]: 'x' }))
    )
    expect(msg).toMatch(/invalid --headers \(header #2 is not a valid header name\)/)
    expect(msg).not.toContain(SECRET)
  })

  it('refuses a --cookies name that is not a valid cookie name', () => {
    const msg = messageOf(() =>
      parseCookiesFlags(undefined, JSON.stringify([{ name: `a ${SECRET}`, value: 'x' }]))
    )
    expect(msg).toMatch(/invalid --cookies \(cookie #1 does not have a valid cookie name\)/)
    expect(msg).not.toContain(SECRET)
  })
})

describe('parseHeadersFlags — --headers <json|@file>', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'crawlbrulee-headers-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('takes a JSON object of name → value', () => {
    expect(
      parseHeadersFlags(undefined, `{"Authorization": "Bearer ${SECRET}", "X-Tenant-Id": "acme"}`)
    ).toEqual({ Authorization: `Bearer ${SECRET}`, 'X-Tenant-Id': 'acme' })
  })

  it('reads the JSON from a file with @path', async () => {
    const path = join(dir, 'headers.json')
    await writeFile(path, JSON.stringify({ Authorization: `Bearer ${SECRET}` }))
    expect(parseHeadersFlags(undefined, `@${path}`)).toEqual({
      Authorization: `Bearer ${SECRET}`,
    })
  })

  it('names a file it cannot read by its @path', () => {
    expect(() => parseHeadersFlags(undefined, `@${join(dir, 'missing.json')}`)).toThrow(
      /invalid --headers '@.*missing\.json' \(cannot read the file/
    )
  })

  it('rejects bad JSON without quoting it', () => {
    const msg = messageOf(() => parseHeadersFlags(undefined, `{"Authorization": ${SECRET}}`))
    expect(msg).toBe('invalid --headers (must be valid JSON)')
  })

  it('rejects bad JSON in a file without quoting it', async () => {
    const path = join(dir, 'headers.json')
    await writeFile(path, `{"Authorization": ${SECRET}}`)
    const msg = messageOf(() => parseHeadersFlags(undefined, `@${path}`))
    expect(msg).toMatch(/invalid --headers '@.*' \(must be valid JSON\)$/)
    expect(msg).not.toContain(SECRET)
  })

  it('rejects JSON that is not an object', () => {
    expect(() => parseHeadersFlags(undefined, '["a"]')).toThrow(/must be a JSON object/)
    expect(() => parseHeadersFlags(undefined, 'null')).toThrow(/must be a JSON object/)
  })

  it('rejects an empty object', () => {
    expect(() => parseHeadersFlags(undefined, '{}')).toThrow(/no headers given/)
  })

  it('rejects a value that is not a string, naming the header', () => {
    expect(() => parseHeadersFlags(undefined, '{"X-Count": 3}')).toThrow(
      /the value of 'X-Count' must be a string/
    )
  })

  it('rejects an empty name', () => {
    expect(() => parseHeadersFlags(undefined, '{"": "x"}')).toThrow(/a header name is empty/)
  })

  it('rejects the same name twice, ignoring case', () => {
    expect(() => parseHeadersFlags(undefined, '{"X-Key": "a", "x-key": "b"}')).toThrow(
      /header 'x-key' is given more than once/
    )
  })

  it('rejects a second --headers', () => {
    expect(() => parseHeadersFlags(undefined, ['{"a": "1"}', '{"b": "2"}'])).toThrow(
      /--headers is given more than once/
    )
  })

  it('refuses to mix --header and --headers', () => {
    expect(() => parseHeadersFlags(['X-A: 1'], '{"X-B": "2"}')).toThrow(
      'use --header or --headers, not both'
    )
  })
})

describe('parseCookiesFlags — --cookie name=value', () => {
  it('returns undefined when neither flag is given', () => {
    expect(parseCookiesFlags(undefined, undefined)).toBeUndefined()
    expect(parseCookiesFlags([], undefined)).toBeUndefined()
  })

  it('turns each --cookie into a { name, value }, in order', () => {
    expect(parseCookiesFlags([`session_id=${SECRET}`, 'theme=dark'], undefined)).toEqual([
      { name: 'session_id', value: SECRET },
      { name: 'theme', value: 'dark' },
    ])
  })

  it('splits on the first = only, so a value can hold =', () => {
    expect(parseCookiesFlags(['token=abc==', 'q=a=b'], undefined)).toEqual([
      { name: 'token', value: 'abc==' },
      { name: 'q', value: 'a=b' },
    ])
  })

  it('trims spaces around the name and the value, and keeps an empty value', () => {
    expect(parseCookiesFlags([' sid = abc ', 'empty='], undefined)).toEqual([
      { name: 'sid', value: 'abc' },
      { name: 'empty', value: '' },
    ])
  })

  it('rejects a value with no =, without echoing it', () => {
    const msg = messageOf(() => parseCookiesFlags(['a=1', SECRET], undefined))
    expect(msg).toBe('invalid --cookie #2 (must be name=value)')
  })

  it('rejects an empty name, without echoing the value', () => {
    const msg = messageOf(() => parseCookiesFlags([`=${SECRET}`], undefined))
    expect(msg).toBe('invalid --cookie #1 (the name before = is empty)')
  })
})

describe('parseCookiesFlags — --cookies <json|@file>', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'crawlbrulee-cookies-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const COOKIES = [
    { name: 'session_id', value: SECRET },
    { name: 'theme', value: 'dark' },
  ]

  it('takes the api form: a JSON array of { name, value }', () => {
    expect(parseCookiesFlags(undefined, JSON.stringify(COOKIES))).toEqual(COOKIES)
  })

  it('reads the JSON from a file with @path', async () => {
    const path = join(dir, 'cookies.json')
    await writeFile(path, JSON.stringify(COOKIES))
    expect(parseCookiesFlags(undefined, `@${path}`)).toEqual(COOKIES)
  })

  it('rejects bad JSON without quoting it', () => {
    const msg = messageOf(() => parseCookiesFlags(undefined, `[{"name": "sid", "value": ${SECRET}`))
    expect(msg).toBe('invalid --cookies (must be valid JSON)')
  })

  it('rejects JSON that is not an array', () => {
    expect(() => parseCookiesFlags(undefined, `{"session_id": "${SECRET}"}`)).toThrow(
      /must be a JSON array/
    )
  })

  it('rejects an empty array', () => {
    expect(() => parseCookiesFlags(undefined, '[]')).toThrow(/no cookies given/)
  })

  it('rejects an item that is not an object', () => {
    expect(() => parseCookiesFlags(undefined, '["sid=1"]')).toThrow(
      /cookie #1 must be an object with a name and a value/
    )
  })

  it('rejects a missing or empty name', () => {
    expect(() => parseCookiesFlags(undefined, '[{"value": "x"}]')).toThrow(/cookie #1 needs a name/)
    expect(() => parseCookiesFlags(undefined, '[{"name": "", "value": "x"}]')).toThrow(
      /cookie #1 needs a name/
    )
  })

  it('rejects a value that is not a string', () => {
    expect(() => parseCookiesFlags(undefined, '[{"name": "n", "value": 1}]')).toThrow(
      /the value of cookie 'n' must be a string/
    )
  })

  it('rejects other keys, naming them but not the value', () => {
    const msg = messageOf(() =>
      parseCookiesFlags(undefined, `[{"name": "sid", "value": "${SECRET}", "domain": "x"}]`)
    )
    expect(msg).toMatch(/cookie 'sid' may only have a name and a value, not domain/)
    expect(msg).not.toContain(SECRET)
  })

  it('rejects a second --cookies', () => {
    expect(() => parseCookiesFlags(undefined, ['[]', '[]'])).toThrow(
      /--cookies is given more than once/
    )
  })

  it('refuses to mix --cookie and --cookies', () => {
    expect(() => parseCookiesFlags(['a=1'], JSON.stringify(COOKIES))).toThrow(
      'use --cookie or --cookies, not both'
    )
  })
})

describe('buildScrapeRequest — headers and cookies', () => {
  it('leaves both fields out when no flag is given', () => {
    const body = buildScrapeRequest('https://example.com', {})
    expect('headers' in body).toBe(false)
    expect('cookies' in body).toBe(false)
  })

  it('puts headers and cookies on the body, next to the other fields', () => {
    const body = buildScrapeRequest('https://app.example.com/orders', {
      header: ['Authorization: Bearer abc', 'X-Tenant-Id: acme'],
      cookie: ['session_id=a1b2c3'],
    })
    expect(body).toEqual({
      url: 'https://app.example.com/orders',
      extract: { metadata: true, markdown: true },
      headers: { Authorization: 'Bearer abc', 'X-Tenant-Id': 'acme' },
      cookies: [{ name: 'session_id', value: 'a1b2c3' }],
    })
  })

  it('carries them on the async body too, next to the webhook', () => {
    const body = buildAsyncScrapeRequest('https://app.example.com/orders', {
      headers: '{"X-Api-Key": "k"}',
      cookies: '[{"name": "sid", "value": "v"}]',
      webhookUrl: 'https://hooks.example.com/x',
    })
    expect(body.headers).toEqual({ 'X-Api-Key': 'k' })
    expect(body.cookies).toEqual([{ name: 'sid', value: 'v' }])
    expect(body.webhook).toEqual({ url: 'https://hooks.example.com/x' })
  })
})

describe('the custom_user_agent warning', () => {
  it('prints in text mode like any other warning', () => {
    // `custom_user_agent` is not in the sdk 1.3 warning union; the type stays
    // open to any string, so a new code never breaks the render.
    const res = {
      url: 'https://example.com/',
      requested_url: 'https://example.com/',
      markdown: '# hi',
      warnings: ['custom_user_agent'],
    } as ScrapeResponse
    expect(renderScrapeText(res)).toContain('# warning: custom_user_agent')
  })
})

describe('headers and cookies end to end (via mocked fetch)', () => {
  let tempCfg: string
  const ORIG_KEY = process.env.CRAWLBRULEE_API_KEY

  beforeEach(async () => {
    tempCfg = await mkdtemp(join(tmpdir(), 'crawlbrulee-cli-'))
    process.env.XDG_CONFIG_HOME = tempCfg
    delete process.env.CRAWLBRULEE_API_KEY
  })

  afterEach(async () => {
    delete process.env.XDG_CONFIG_HOME
    if (ORIG_KEY === undefined) delete process.env.CRAWLBRULEE_API_KEY
    else process.env.CRAWLBRULEE_API_KEY = ORIG_KEY
    await rm(tempCfg, { recursive: true, force: true })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function parse(args: string[]): Promise<Command> {
    const program = new Command().exitOverride()
    registerScrapeCommand(program)
    return program.parseAsync(
      ['scrape', 'url', '--api-key', AUTH.apiKey, '--api-url', AUTH.apiUrl, ...args],
      { from: 'user' }
    )
  }

  it('sends --header and --cookie from the command line to /api/scrape', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            url: 'https://app.example.com/orders',
            markdown: '# orders',
            warnings: ['custom_user_agent'],
          }),
          { status: 200, headers: JSON_HEADERS }
        )
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await parse([
      'https://app.example.com/orders',
      '--header',
      `Authorization: Bearer ${SECRET}`,
      '--header',
      'User-Agent: my-bot/1.0',
      '--cookie',
      'session_id=a1b2c3',
      '--cookie',
      'theme=dark',
      '--text',
    ])

    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(calledUrl).toBe('https://staging-api.example.com/api/scrape')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.headers).toEqual({
      Authorization: `Bearer ${SECRET}`,
      'User-Agent': 'my-bot/1.0',
    })
    expect(body.cookies).toEqual([
      { name: 'session_id', value: 'a1b2c3' },
      { name: 'theme', value: 'dark' },
    ])

    const out = writeSpy.mock.calls.map(c => String(c[0])).join('')
    expect(out).toContain('# warning: custom_user_agent')
    expect(out).not.toContain(SECRET)
  })

  it('sends --headers @file and --cookies to /api/scrape/async', async () => {
    const path = join(tempCfg, 'headers.json')
    await writeFile(path, JSON.stringify({ 'X-Api-Key': SECRET }))
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ job_id: 'job_hc' }), { status: 200, headers: JSON_HEADERS })
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await runScrapeUrl('https://app.example.com/orders', {
      ...AUTH,
      async: true,
      headers: [`@${path}`],
      cookies: ['[{"name": "sid", "value": "v"}]'],
      json: true,
    })

    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(calledUrl).toBe('https://staging-api.example.com/api/scrape/async')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.headers).toEqual({ 'X-Api-Key': SECRET })
    expect(body.cookies).toEqual([{ name: 'sid', value: 'v' }])
  })

  it('mixing the two forms fails before any request is made', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit')
    }) as never)

    await expect(
      parse([
        'https://app.example.com/orders',
        '--cookie',
        `sid=${SECRET}`,
        '--cookies',
        `[{"name": "sid", "value": "${SECRET}"}]`,
      ])
    ).rejects.toThrow('process.exit')

    const err = stderrSpy.mock.calls.map(c => String(c[0])).join('')
    expect(err).toContain('use --cookie or --cookies, not both')
    expect(err).not.toContain(SECRET)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a malformed --header fails before any request, without echoing it', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit')
    }) as never)

    await expect(
      parse(['https://app.example.com/orders', '--header', `Bearer ${SECRET}`])
    ).rejects.toThrow('process.exit')

    const err = stderrSpy.mock.calls.map(c => String(c[0])).join('')
    expect(err).toContain('invalid --header #1')
    expect(err).not.toContain(SECRET)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("prints the api's 400 for a refused header", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            name: 'validation_error',
            message:
              'Request validation failed: headers: "Cookie" can\'t be set as a header. Send cookies in the cookies field.',
          }),
          { status: 400, headers: JSON_HEADERS }
        )
    )
    vi.stubGlobal('fetch', fetchMock)
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit')
    }) as never)

    await expect(
      parse(['https://app.example.com/orders', '--header', `Cookie: sid=${SECRET}`])
    ).rejects.toThrow('process.exit')

    // The whole of stderr is the api's own message and nothing else: the cli
    // adds no part of the request, so the value can't reach the screen here.
    const err = stderrSpy.mock.calls.map(c => String(c[0])).join('')
    expect(err).toBe(
      'error: validation_error — Request validation failed: headers: "Cookie" can\'t be set as a header. Send cookies in the cookies field.\n'
    )
  })
})

describe('--headers JSON with the same key twice', () => {
  it('refuses a key spelled the same twice, which JSON.parse would drop', () => {
    const msg = messageOf(() =>
      parseHeadersFlags(undefined, `{"X-Key": "first-${SECRET}", "X-Key": "second-${SECRET}"}`)
    )
    expect(msg).toBe("header 'X-Key' is given more than once")
  })

  it('counts only the outer keys, not keys inside a value or a string', () => {
    // A value must be a string, so a nested object is refused for its type;
    // what matters is that a key-like string inside a value is not counted.
    const out = parseHeadersFlags(undefined, '{"A": "{\\"A\\": 1}", "B": "x\\":"}')
    expect(out).toEqual({ A: '{"A": 1}', B: 'x":' })
  })

  it('reads keys written with escapes the way JSON.parse does', () => {
    const msg = messageOf(() => parseHeadersFlags(undefined, '{"X-Key": "a", "X\\u002dKey": "b"}'))
    expect(msg).toBe("header 'X-Key' is given more than once")
  })
})

describe('an unknown --flag=value never prints the value', () => {
  async function stderrOf(args: string[]): Promise<string> {
    let err = ''
    const program = new Command().exitOverride().configureOutput({
      writeErr: str => {
        err += str
      },
      outputError: (str, write) => write(hideUnknownOptionValue(str)),
    })
    registerScrapeCommand(program)
    registerMapCommand(program)
    await expect(program.parseAsync(args, { from: 'user' })).rejects.toThrow()
    return err
  }

  it('on map, which takes no cookies', async () => {
    const err = await stderrOf(['map', 'https://e.com', `--cookie=sid=${SECRET}`])
    expect(err).toContain("unknown option '--cookie'")
    expect(err).not.toContain(SECRET)
  })

  it('on a typo', async () => {
    const err = await stderrOf([
      'scrape',
      'url',
      'https://e.com',
      `--heder=Authorization: Bearer ${SECRET}`,
    ])
    expect(err).toContain("unknown option '--heder'")
    expect(err).not.toContain(SECRET)
  })

  it('when the value holds a quote', async () => {
    const err = await stderrOf(['map', 'https://e.com', `--cookie=sid='${SECRET}'`])
    expect(err).not.toContain(SECRET)
  })

  it('on a short flag with the value stuck to it', async () => {
    const err = await stderrOf(['map', 'https://e.com', `-x${SECRET}`])
    expect(err).toContain("unknown option '-x'")
    expect(err).not.toContain(SECRET)
  })
})

describe('hideUnknownOptionValue', () => {
  it('leaves every other message as it is', () => {
    const msg = "error: missing required argument 'url'\n"
    expect(hideUnknownOptionValue(msg)).toBe(msg)
  })

  it('leaves an unknown option with no value as it is', () => {
    const msg = "error: unknown option '--nope'\n"
    expect(hideUnknownOptionValue(msg)).toBe(msg)
  })
})
