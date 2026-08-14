/**
 * The CLI version string must match the published package version.
 *
 * `CLI_VERSION` spells the version out as a literal, so a release that bumps
 * package.json and forgets it ships a binary whose `--version` reports the
 * previous release — which is exactly what 3.2.1 did, announcing 3.2.0 for the
 * whole of its life. Nothing else compares the two, and the mismatch is
 * invisible from inside: every test passes and the build is clean. The js and
 * python sdks each carry the same guard for the same reason.
 */
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLI_VERSION } from '../src/version.js'

const packageVersion = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8')
).version as string

describe('CLI_VERSION', () => {
  test('matches the version in package.json', () => {
    expect(CLI_VERSION).toBe(packageVersion)
  })
})
