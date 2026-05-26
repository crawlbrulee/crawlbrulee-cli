import { existsSync } from 'fs'
import { chmod, mkdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

export interface CliConfig {
  apiKey?: string
  apiUrl?: string
}

// Exported for tests — pure (no `process` / `os` calls) so platform-specific
// paths can be exercised without spying on globals.
export function getConfigDirForPlatform(
  platform: NodeJS.Platform,
  home: string,
  env: NodeJS.ProcessEnv
): string {
  // XDG_CONFIG_HOME wins on every platform so tests / power users can opt in.
  const xdg = env.XDG_CONFIG_HOME?.trim()
  if (xdg) return join(xdg, 'crawlbrulee')

  switch (platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'crawlbrulee')
    case 'win32': {
      const appdata = env.APPDATA?.trim()
      return join(appdata || join(home, 'AppData', 'Roaming'), 'crawlbrulee')
    }
    default:
      return join(home, '.config', 'crawlbrulee')
  }
}

export function getConfigDir(): string {
  return getConfigDirForPlatform(process.platform, homedir(), process.env)
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

export async function readConfig(): Promise<CliConfig> {
  const path = getConfigPath()
  if (!existsSync(path)) return {}

  try {
    const raw = await readFile(path, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const v = parsed as Record<string, unknown>
      return {
        apiKey: typeof v.apiKey === 'string' ? v.apiKey : undefined,
        apiUrl: typeof v.apiUrl === 'string' ? v.apiUrl : undefined,
      }
    }
    return {}
  } catch {
    return {}
  }
}

export async function writeConfig(update: Partial<CliConfig>): Promise<void> {
  await mkdir(getConfigDir(), { recursive: true })
  const current = await readConfig()
  const next: CliConfig = { ...current, ...update }
  const path = getConfigPath()
  await writeFile(path, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })

  // writeFile's `mode` only applies on creation, so re-enforce 0600 on POSIX
  // for pre-existing files with looser perms. Windows uses NTFS ACLs, so
  // chmod is a no-op there.
  if (process.platform !== 'win32') {
    try {
      const s = await stat(path)
      if ((s.mode & 0o777) !== 0o600) {
        await chmod(path, 0o600)
      }
    } catch {
      // best-effort
    }
  }
}

export async function clearConfig(): Promise<void> {
  const path = getConfigPath()
  if (existsSync(path)) {
    await unlink(path)
  }
}
