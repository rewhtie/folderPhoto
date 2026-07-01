import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export function parseAppName(acfContent: string): string | null {
  const match = acfContent.match(/"name"\s+"([^"]*)"/i)
  return match ? match[1] : null
}

// librarycache 位于 <Steam>\appcache\librarycache，游戏清单在 <Steam>\steamapps\appmanifest_<appid>.acf
function steamAppsDirFor(librarycacheDir: string): string {
  const steamRoot = dirname(dirname(librarycacheDir))
  return join(steamRoot, 'steamapps')
}

export async function loadAppNames(librarycacheDir: string): Promise<Record<string, string>> {
  const steamAppsDir = steamAppsDirFor(librarycacheDir)

  let entries: string[]
  try {
    entries = await readdir(steamAppsDir)
  } catch {
    return {}
  }

  const names: Record<string, string> = {}

  await Promise.all(
    entries
      .filter((entry) => /^appmanifest_\d+\.acf$/i.test(entry))
      .map(async (entry) => {
        const appId = entry.replace(/^appmanifest_(\d+)\.acf$/i, '$1')
        try {
          const content = await readFile(join(steamAppsDir, entry), 'utf-8')
          const name = parseAppName(content)
          if (name) {
            names[appId] = name
          }
        } catch {
          // 单个清单读取失败忽略
        }
      }),
  )

  return names
}
