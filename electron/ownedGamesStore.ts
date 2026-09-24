import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { OwnedGame } from '../src/shared/ownedGames.js'
import { loadAppInfoEntries } from './appInfoStore.js'
import type { AppInfoEntry } from './appInfoParser.js'

let cacheBaseDir = ''

const STEAM_ID64_BASE = 76561197960265728n

export function steamAccountId(steamId: string): string | null {
  if (!/^\d{17}$/.test(steamId)) return null

  try {
    const accountId = BigInt(steamId) - STEAM_ID64_BASE
    return accountId >= 0n && accountId <= 0xffffffffn ? accountId.toString() : null
  } catch {
    return null
  }
}

function extractBalancedBlock(content: string, key: string): string | null {
  const keyMatch = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\{`, 'i').exec(content)
  if (!keyMatch) return null

  const openBrace = content.indexOf('{', keyMatch.index)
  let depth = 0
  for (let index = openBrace; index < content.length; index += 1) {
    if (content[index] === '{') depth += 1
    if (content[index] === '}') {
      depth -= 1
      if (depth === 0) return content.slice(openBrace + 1, index)
    }
  }
  return null
}

export function parseLocalPlaytimes(content: string): Map<number, number> {
  const appsBlock = extractBalancedBlock(content, 'apps')
  const playtimes = new Map<number, number>()
  if (!appsBlock) return playtimes

  const appPattern = /"(\d+)"\s*\{/g
  for (const match of appsBlock.matchAll(appPattern)) {
    const appBlock = extractBalancedBlock(appsBlock.slice(match.index), match[1])
    if (!appBlock) continue
    const playtimeMatch = /"Playtime"\s*"(\d+)"/i.exec(appBlock)
    if (playtimeMatch) playtimes.set(Number(match[1]), Number(playtimeMatch[1]))
  }
  return playtimes
}

export async function loadLocalPlaytimes(
  libraryCacheDir: string,
  steamId: string,
): Promise<Map<number, number>> {
  const accountId = steamAccountId(steamId)
  if (!accountId) return new Map()

  const steamRoot = dirname(dirname(libraryCacheDir))
  const localConfigPath = join(steamRoot, 'userdata', accountId, 'config', 'localconfig.vdf')
  try {
    return parseLocalPlaytimes(await readFile(localConfigPath, 'utf-8'))
  } catch {
    return new Map()
  }
}

export function mergeLocalPlaytimes(
  games: OwnedGame[],
  localPlaytimes: ReadonlyMap<number, number>,
): OwnedGame[] {
  return games.map((game) => {
    if (game.playtimeForever > 0) return game
    const localPlaytime = localPlaytimes.get(game.appid)
    return localPlaytime !== undefined && localPlaytime > 0
      ? { ...game, playtimeForever: localPlaytime }
      : game
  })
}

export function setOwnedGamesCacheBaseDir(dir: string): void {
  cacheBaseDir = dir
}

const CACHE_FILENAME = 'owned-games.json'

export async function loadCachedOwnedGames(): Promise<OwnedGame[] | null> {
  if (!cacheBaseDir) return null
  const filePath = join(cacheBaseDir, CACHE_FILENAME)
  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return isValidOwnedGames(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function saveOwnedGamesCache(games: OwnedGame[]): Promise<void> {
  if (!cacheBaseDir) return
  await mkdir(cacheBaseDir, { recursive: true })
  const filePath = join(cacheBaseDir, CACHE_FILENAME)
  await writeFile(filePath, JSON.stringify(games, null, 2), 'utf-8')
}

function isValidOwnedGames(value: unknown): value is OwnedGame[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (g) =>
      typeof g === 'object' &&
      g !== null &&
      typeof (g as OwnedGame).appid === 'number' &&
      typeof (g as OwnedGame).name === 'string' &&
      typeof (g as OwnedGame).playtimeForever === 'number',
  )
}

interface RawOwnedGame {
  appid: number
  name?: string
  playtime_forever?: number
  img_icon_url?: string
}

// 纯函数：解析 Steam API 响应，便于测试
export function parseOwnedGamesResponse(data: unknown): OwnedGame[] {
  if (typeof data !== 'object' || data === null) return []
  const resp = data as { response?: { games?: RawOwnedGame[] } }
  const games = resp.response?.games
  if (!Array.isArray(games)) return []
  return games.map((g) => ({
    appid: g.appid,
    name: g.name ?? '',
    playtimeForever: g.playtime_forever ?? 0,
  }))
}

// 扫描 librarycache 目录，获取所有游戏 appid（含家庭共享）
export async function scanLibraryCacheAppIds(libraryCacheDir: string): Promise<number[]> {
  try {
    const entries = await readdir(libraryCacheDir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
      .map((e) => Number(e.name))
  } catch {
    return []
  }
}

// 合并 API 数据与 librarycache appids，family 游戏标记 isFamily
// 用 appInfo 过滤 DLC，并给 family 游戏补名字
// recentlyPlayed 用于给家庭游戏补 playtime_forever（仅最近两周玩过的）
export function mergeWithLibraryCache(
  apiGames: OwnedGame[],
  libraryCacheAppIds: number[],
  appInfoEntries: Record<string, AppInfoEntry>,
  recentlyPlayed?: Map<number, number>,
): OwnedGame[] {
  const apiAppIds = new Set(apiGames.map((g) => g.appid))
  const familyGames: OwnedGame[] = libraryCacheAppIds
    .filter((id) => !apiAppIds.has(id))
    .filter((id) => {
      const info = appInfoEntries[String(id)]
      return !info || info.type.toLowerCase() !== 'dlc'
    })
    .map((appid) => {
      const playtime = recentlyPlayed?.get(appid) ?? 0
      return {
        appid,
        name: appInfoEntries[String(appid)]?.name ?? '',
        playtimeForever: playtime,
        isFamily: true,
      }
    })
  // 也从 API 结果里过滤掉 DLC
  const ownedNonDlc = apiGames.filter((g) => {
    const info = appInfoEntries[String(g.appid)]
    return !info || info.type.toLowerCase() !== 'dlc'
  })
  return [...ownedNonDlc, ...familyGames]
}

// 扫描 librarycache 并加载 appinfo，返回合并后的游戏列表
export async function fetchOwnedGamesWithLibrary(
  apiKey: string,
  steamId: string,
  libraryCacheDir: string,
): Promise<OwnedGame[]> {
  const [apiGames, libraryAppIds, appInfoEntries, recentlyPlayed, localPlaytimes] = await Promise.all([
    fetchOwnedGames(apiKey, steamId),
    scanLibraryCacheAppIds(libraryCacheDir),
    loadAppInfoEntries(libraryCacheDir),
    fetchRecentlyPlayedGames(apiKey, steamId),
    loadLocalPlaytimes(libraryCacheDir, steamId),
  ])
  return mergeLocalPlaytimes(
    mergeWithLibraryCache(apiGames, libraryAppIds, appInfoEntries, recentlyPlayed),
    localPlaytimes,
  )
}

// 调 Steam Web API：IPlayerService/GetOwnedGames/v1/
export async function fetchOwnedGames(apiKey: string, steamId: string): Promise<OwnedGame[]> {
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}&include_appinfo=true&include_played_free_games=true&format=json`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Steam API 请求失败：HTTP ${response.status}`)
  }
  const data = await response.json()
  return parseOwnedGamesResponse(data)
}

// 调 Steam Web API：IPlayerService/GetRecentlyPlayedGames/v1/
// 返回最近两周玩过的游戏（含家庭共享），带 playtime_forever
export async function fetchRecentlyPlayedGames(apiKey: string, steamId: string): Promise<Map<number, number>> {
  const url = `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}&format=json`
  try {
    const response = await fetch(url)
    if (!response.ok) return new Map()
    const data = (await response.json()) as { response?: { games?: Array<{ appid: number; playtime_forever?: number }> } }
    const games = data.response?.games ?? []
    const map = new Map<number, number>()
    for (const g of games) {
      if (typeof g.playtime_forever === 'number') {
        map.set(g.appid, g.playtime_forever)
      }
    }
    return map
  } catch {
    return new Map()
  }
}
