import type { OwnedGame } from './ownedGames.js'

export type Tier = 'xl' | 'l' | 'm' | 's'
export type Orientation = 'landscape' | 'portrait'

export interface TieredGames {
  xl: OwnedGame[]
  l: OwnedGame[]
  m: OwnedGame[]
  s: OwnedGame[]
  family: OwnedGame[] // 家庭共享游戏（无 API 时长）
}

// 按个人库分位分档：XL 前 10%，L 10-30%，M 30-60%，S 60-100%
// 对 playtimeForever > 0 的游戏分档（含从最近游玩拿到时长的家庭游戏）
// 家庭共享且无时长的游戏单独放 family 数组
export function tierGames(games: OwnedGame[]): TieredGames {
  const played = games
    .filter((g) => g.playtimeForever > 0)
    .sort((a, b) => b.playtimeForever - a.playtimeForever)

  const family = games.filter((g) => g.isFamily && g.playtimeForever === 0)

  const n = played.length
  const empty: TieredGames = { xl: [], l: [], m: [], s: [], family }
  if (n === 0) return empty
  if (n < 4) return { ...empty, xl: played } // 退化：全部 XL，UI 统一大小

  const xlEnd = Math.max(1, Math.floor(n * 0.1))
  const lEnd = Math.max(xlEnd + 1, Math.floor(n * 0.3))
  const mEnd = Math.max(lEnd + 1, Math.floor(n * 0.6))

  return {
    xl: played.slice(0, xlEnd),
    l: played.slice(xlEnd, lEnd),
    m: played.slice(lEnd, mEnd),
    s: played.slice(mEnd),
    family,
  }
}
