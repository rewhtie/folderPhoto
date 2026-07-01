import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseAppInfo, type AppInfoEntry } from './appInfoParser.js'

// librarycache 在 <Steam>\appcache\librarycache，appinfo.vdf 在 <Steam>\appcache\appinfo.vdf
export async function loadAppInfoEntries(librarycacheDir: string): Promise<Record<string, AppInfoEntry>> {
  const appcacheDir = dirname(librarycacheDir)
  const appInfoPath = join(appcacheDir, 'appinfo.vdf')

  try {
    const buffer = await readFile(appInfoPath)
    return parseAppInfo(buffer)
  } catch {
    return {}
  }
}
