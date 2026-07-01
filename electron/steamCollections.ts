import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface SteamCollection {
  name: string
  appIds: string[]
}

interface CloudStorageEntry {
  value?: string
}

// 解析 cloud-storage-namespace-1.json 的 [key, value] 数组，提取收藏夹
export function parseSteamCollections(data: unknown): SteamCollection[] {
  if (!Array.isArray(data)) {
    return []
  }

  const collections: SteamCollection[] = []

  for (const item of data) {
    if (!Array.isArray(item) || item.length < 2) {
      continue
    }
    const [key, entry] = item
    if (typeof key !== 'string' || !key.startsWith('user-collections.')) {
      continue
    }

    const valueStr = (entry as CloudStorageEntry)?.value
    if (typeof valueStr !== 'string') {
      continue
    }

    try {
      const parsed = JSON.parse(valueStr)
      if (typeof parsed?.name !== 'string' || !Array.isArray(parsed.added)) {
        continue
      }
      // 跳过没有名称的收藏夹和内置的"已隐藏"
      const name = parsed.name.trim()
      if (!name || key === 'user-collections.hidden') {
        continue
      }
      const appIds = parsed.added
        .filter((id: unknown): id is number => typeof id === 'number')
        .map((id: number) => String(id))
      collections.push({ name, appIds })
    } catch {
      // 单个条目解析失败忽略
    }
  }

  return collections
}

// 遍历 <Steam>\userdata\<account>\config\cloudstorage\cloud-storage-namespace-1.json
// librarycache 在 <Steam>\appcache\librarycache，userdata 在 <Steam>\userdata
export async function loadSteamCollections(librarycacheDir: string): Promise<SteamCollection[]> {
  const steamRoot = dirname(dirname(librarycacheDir))
  const userdataDir = join(steamRoot, 'userdata')

  let accounts: string[]
  try {
    accounts = await readdir(userdataDir)
  } catch {
    return []
  }

  const all: SteamCollection[] = []

  for (const account of accounts) {
    const file = join(userdataDir, account, 'config', 'cloudstorage', 'cloud-storage-namespace-1.json')
    try {
      const raw = await readFile(file, 'utf-8')
      const parsed = JSON.parse(raw)
      for (const c of parseSteamCollections(parsed)) {
        all.push(c)
      }
    } catch {
      // 单个账号读取失败忽略
    }
  }

  return all
}
