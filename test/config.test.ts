import { mkdtemp, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearConfig,
  getConfigDirForPlatform,
  getConfigPath,
  readConfig,
  writeConfig,
} from '../src/config/store.js'
import { DEFAULT_API_URL, MissingAuthError, resolveAuth } from '../src/config/resolve.js'

describe('config store', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'crawlbrulee-cli-'))
    process.env.XDG_CONFIG_HOME = dir
  })

  afterEach(async () => {
    delete process.env.XDG_CONFIG_HOME
    await rm(dir, { recursive: true, force: true })
  })

  it('returns empty when no config file exists', async () => {
    expect(await readConfig()).toEqual({})
  })

  it('persists and reads back', async () => {
    await writeConfig({ apiKey: 'cwbl_test_xyz', apiUrl: 'https://staging.example' })
    expect(await readConfig()).toEqual({
      apiKey: 'cwbl_test_xyz',
      apiUrl: 'https://staging.example',
    })
  })

  it('partial updates merge with existing state', async () => {
    await writeConfig({ apiKey: 'k1', apiUrl: 'u1' })
    await writeConfig({ apiKey: 'k2' })
    expect(await readConfig()).toEqual({ apiKey: 'k2', apiUrl: 'u1' })
  })

  it('clearConfig removes the file', async () => {
    await writeConfig({ apiKey: 'cwbl_test' })
    await clearConfig()
    expect(await readConfig()).toEqual({})
  })

  // POSIX-only: NTFS doesn't honor POSIX modes; writeConfig deliberately
  // skips chmod on Windows, so the assertion below would fail there.
  it.skipIf(process.platform === 'win32')(
    'writes the file with mode 0600 for secret hygiene (POSIX only)',
    async () => {
      await writeConfig({ apiKey: 'cwbl_test' })
      const s = await stat(getConfigPath())
      expect(s.mode & 0o777).toBe(0o600)
    }
  )

  it('returns empty for malformed JSON instead of throwing', async () => {
    await writeConfig({ apiKey: 'ok' })
    const { writeFile } = await import('fs/promises')
    await writeFile(getConfigPath(), '{not json')
    expect(await readConfig()).toEqual({})
  })
})

describe('getConfigDirForPlatform', () => {
  it('uses ~/.config on Linux when XDG is unset', () => {
    expect(getConfigDirForPlatform('linux', '/home/foo', {})).toBe('/home/foo/.config/crawlbrulee')
  })

  it('uses ~/Library/Application Support on macOS', () => {
    expect(getConfigDirForPlatform('darwin', '/Users/foo', {})).toBe(
      '/Users/foo/Library/Application Support/crawlbrulee'
    )
  })

  it('uses %APPDATA% on Windows when set', () => {
    expect(
      getConfigDirForPlatform('win32', 'C:\\Users\\foo', {
        APPDATA: 'C:\\Users\\foo\\AppData\\Roaming',
      })
    ).toBe(join('C:\\Users\\foo\\AppData\\Roaming', 'crawlbrulee'))
  })

  it('falls back to ~/AppData/Roaming on Windows when APPDATA is missing', () => {
    expect(getConfigDirForPlatform('win32', 'C:\\Users\\foo', {})).toBe(
      join('C:\\Users\\foo', 'AppData', 'Roaming', 'crawlbrulee')
    )
  })

  it('honors XDG_CONFIG_HOME on every platform when set', () => {
    expect(getConfigDirForPlatform('darwin', '/Users/foo', { XDG_CONFIG_HOME: '/custom' })).toBe(
      '/custom/crawlbrulee'
    )
    expect(
      getConfigDirForPlatform('win32', 'C:\\Users\\foo', {
        XDG_CONFIG_HOME: '/custom',
        APPDATA: 'C:\\should-be-ignored',
      })
    ).toBe('/custom/crawlbrulee')
    expect(getConfigDirForPlatform('linux', '/home/foo', { XDG_CONFIG_HOME: '/custom' })).toBe(
      '/custom/crawlbrulee'
    )
  })

  it('treats whitespace-only XDG and APPDATA as unset', () => {
    expect(getConfigDirForPlatform('linux', '/home/foo', { XDG_CONFIG_HOME: '   ' })).toBe(
      '/home/foo/.config/crawlbrulee'
    )
    expect(getConfigDirForPlatform('win32', 'C:\\Users\\foo', { APPDATA: '   ' })).toBe(
      join('C:\\Users\\foo', 'AppData', 'Roaming', 'crawlbrulee')
    )
  })
})

describe('resolveAuth precedence', () => {
  let dir: string
  const ORIGINAL_KEY = process.env.CRAWLBRULEE_API_KEY
  const ORIGINAL_URL = process.env.CRAWLBRULEE_API_URL

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'crawlbrulee-cli-'))
    process.env.XDG_CONFIG_HOME = dir
    delete process.env.CRAWLBRULEE_API_KEY
    delete process.env.CRAWLBRULEE_API_URL
  })

  afterEach(async () => {
    delete process.env.XDG_CONFIG_HOME
    if (ORIGINAL_KEY === undefined) delete process.env.CRAWLBRULEE_API_KEY
    else process.env.CRAWLBRULEE_API_KEY = ORIGINAL_KEY
    if (ORIGINAL_URL === undefined) delete process.env.CRAWLBRULEE_API_URL
    else process.env.CRAWLBRULEE_API_URL = ORIGINAL_URL
    await rm(dir, { recursive: true, force: true })
  })

  it('flag wins over env wins over file', async () => {
    await writeConfig({ apiKey: 'from-file', apiUrl: 'https://file.example' })
    process.env.CRAWLBRULEE_API_KEY = 'from-env'
    process.env.CRAWLBRULEE_API_URL = 'https://env.example'
    const r = await resolveAuth({ flagApiKey: 'from-flag', flagApiUrl: 'https://flag.example' })
    expect(r).toEqual({ apiKey: 'from-flag', apiUrl: 'https://flag.example' })
  })

  it('env wins when no flag', async () => {
    await writeConfig({ apiKey: 'from-file', apiUrl: 'https://file.example' })
    process.env.CRAWLBRULEE_API_KEY = 'from-env'
    process.env.CRAWLBRULEE_API_URL = 'https://env.example'
    expect(await resolveAuth({})).toEqual({
      apiKey: 'from-env',
      apiUrl: 'https://env.example',
    })
  })

  it('file wins when no flag and no env', async () => {
    await writeConfig({ apiKey: 'from-file', apiUrl: 'https://file.example' })
    expect(await resolveAuth({})).toEqual({
      apiKey: 'from-file',
      apiUrl: 'https://file.example',
    })
  })

  it('falls back to the default base URL when no source sets one', async () => {
    await writeConfig({ apiKey: 'k' })
    const r = await resolveAuth({})
    expect(r.apiUrl).toBe(DEFAULT_API_URL)
  })

  it('throws MissingAuthError when no source has a key', async () => {
    await expect(resolveAuth({})).rejects.toThrow(MissingAuthError)
  })

  it('treats whitespace-only sources as empty', async () => {
    process.env.CRAWLBRULEE_API_KEY = '   '
    await writeConfig({ apiKey: 'real-key-from-file' })
    expect((await resolveAuth({})).apiKey).toBe('real-key-from-file')
  })
})
