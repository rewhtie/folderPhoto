import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

// 成就统一结构（无论本地还是 API 来源）
export interface Achievement {
  id: string // 内部 ID（API 有 apiName，本地有原始 key）
  name: string // 显示名（本地没有则为空）
  description: string // 描述（本地没有则为空）
  iconUrl: string // 图标 URL（本地没有则为空）
  achieved: boolean // 是否解锁
  unlockTime: number | null // 解锁时间戳（秒），无则 null
}

export type AchievementSource = 'local' | 'api'

export interface AchievementResult {
  source: AchievementSource
  achievements: Achievement[]
}

// 扫描所有账号的 userdata/<account>/stats/UserGameStats_<appid>.json
// librarycache 在 <Steam>\appcache\librarycache，userdata 在 <Steam>\userdata
export async function loadLocalAchievements(librarycacheDir: string, appId: string): Promise<AchievementResult> {
  const steamRoot = dirname(dirname(librarycacheDir))
  const userdataDir = join(steamRoot, 'userdata')

  let accounts: string[]
  try {
    accounts = await readdir(userdataDir)
  } catch {
    return { source: 'local', achievements: [] }
  }

  const achievements: Achievement[] = []

  for (const account of accounts) {
    const file = join(userdataDir, account, 'stats', `UserGameStats_${appId}.json`)
    try {
      const raw = await readFile(file, 'utf-8')
      const parsed = JSON.parse(raw)
      const fromFile = extractFromLocalStats(parsed)
      // 多账号合并：已解锁的覆盖未解锁的
      for (const a of fromFile) {
        const existing = achievements.find((x) => x.id === a.id)
        if (!existing) {
          achievements.push(a)
        } else if (a.achieved && !existing.achieved) {
          existing.achieved = true
          existing.unlockTime = a.unlockTime
        }
      }
    } catch {
      // 单个账号读取失败忽略
    }
  }

  return { source: 'local', achievements }
}

// 本地 stats 文件结构：{ achievements: { [id]: { earned, earned_time, ... }, ... } }
function extractFromLocalStats(parsed: unknown): Achievement[] {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return []
  }
  const obj = parsed as Record<string, unknown>
  const ach = obj.achievements
  if (typeof ach !== 'object' || ach === null || Array.isArray(ach)) {
    return []
  }

  const result: Achievement[] = []
  for (const [id, value] of Object.entries(ach as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue
    const v = value as Record<string, unknown>
    const achieved = v.earned === true || v.earned === 1 || v.earned === '1'
    const unlockTime = typeof v.earned_time === 'number' ? v.earned_time : null
    result.push({
      id,
      name: '',
      description: '',
      iconUrl: '',
      achieved,
      unlockTime,
    })
  }
  return result
}

// 调 Steam Web API：ISteamUserStats/GetPlayerAchievements/v1/
export async function fetchApiAchievements(
  appId: string,
  apiKey: string,
  steamId: string,
): Promise<AchievementResult> {
  const url = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}&appid=${encodeURIComponent(appId)}&l=schinese`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Steam API 请求失败：HTTP ${response.status}`)
  }

  const data = (await response.json()) as ApiResponse
  const playerStats = data?.playerstats
  if (!playerStats || playerStats.success !== true) {
    throw new Error(playerStats?.error || 'Steam API 返回失败')
  }

  const achievements: Achievement[] = (playerStats.achievements ?? []).map((a) => ({
    id: a.apiname ?? '',
    name: a.name ?? '',
    description: a.description ?? '',
    iconUrl: a.icon ?? '',
    achieved: a.achieved === 1,
    unlockTime: typeof a.unlocktime === 'number' && a.unlocktime > 0 ? a.unlocktime : null,
  }))

  return { source: 'api', achievements }
}

interface ApiAchievement {
  apiname?: string
  achieved: number
  name?: string
  description?: string
  icon?: string // 未解锁图标
  icongray?: string
  unlocktime: number
}

interface ApiResponse {
  playerstats: {
    success: boolean
    error?: string
    achievements?: ApiAchievement[]
  }
}
