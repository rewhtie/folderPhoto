import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { OwnedGame } from '../src/shared/ownedGames.js'

let cacheBaseDir = ''

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
export function mergeWithLibraryCache(
  apiGames: OwnedGame[],
  libraryCacheAppIds: number[],
): OwnedGame[] {
  const apiAppIds = new Set(apiGames.map((g) => g.appid))
  const familyGames: OwnedGame[] = libraryCacheAppIds
    .filter((id) => !apiAppIds.has(id))
    .map((appid) => ({ appid, name: '', playtimeForever: 0, isFamily: true }))
  return [...apiGames, ...familyGames]
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
