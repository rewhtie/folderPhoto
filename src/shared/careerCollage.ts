import type { OwnedGame } from './ownedGames'

export type Tier = 'xl' | 'l' | 'm' | 's'
export type Orientation = 'landscape' | 'portrait'

export interface TieredGames {
  xl: OwnedGame[]
  l: OwnedGame[]
  m: OwnedGame[]
  s: OwnedGame[]
}

// 按个人库分位分档：XL 前 10%，L 10-30%，M 30-60%，S 60-100%
// 仅对 playtimeForever > 0 的游戏分档
export function tierGames(games: OwnedGame[]): TieredGames {
  const played = games
    .filter((g) => g.playtimeForever > 0)
    .sort((a, b) => b.playtimeForever - a.playtimeForever)

  const n = played.length
  const empty: TieredGames = { xl: [], l: [], m: [], s: [] }
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
  }
}
