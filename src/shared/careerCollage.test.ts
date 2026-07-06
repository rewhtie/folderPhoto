import { describe, it, expect } from 'vitest'
import { tierGames } from './careerCollage'
import type { OwnedGame } from './ownedGames'

function game(appid: number, playtime: number): OwnedGame {
  return { appid, name: `g${appid}`, playtimeForever: playtime }
}

describe('tierGames', () => {
  it('returns all empty for zero games', () => {
    expect(tierGames([])).toEqual({ xl: [], l: [], m: [], s: [] })
  })

  it('filters out unplayed games (playtime 0)', () => {
    const result = tierGames([game(1, 0), game(2, 60), game(3, 0)])
    const total = result.xl.length + result.l.length + result.m.length + result.s.length
    expect(total).toBe(1)
  })

  it('n < 4: puts all in xl (uniform)', () => {
    const result = tierGames([game(1, 300), game(2, 200), game(3, 100)])
    expect(result.xl).toHaveLength(3)
    expect(result.l).toEqual([])
    expect(result.m).toEqual([])
    expect(result.s).toEqual([])
  })

  it('n = 10: splits 1/2/3/4', () => {
    const games = Array.from({ length: 10 }, (_, i) => game(i + 1, 1000 - i * 10))
    const result = tierGames(games)
    expect(result.xl).toHaveLength(1)
    expect(result.l).toHaveLength(2)
    expect(result.m).toHaveLength(3)
    expect(result.s).toHaveLength(4)
  })

  it('n = 100: splits 10/20/30/40', () => {
    const games = Array.from({ length: 100 }, (_, i) => game(i + 1, 10000 - i))
    const result = tierGames(games)
    expect(result.xl).toHaveLength(10)
    expect(result.l).toHaveLength(20)
    expect(result.m).toHaveLength(30)
    expect(result.s).toHaveLength(40)
  })

  it('sorts by playtime descending within all tiers', () => {
    const games = Array.from({ length: 10 }, (_, i) => game(i + 1, 1000 - i * 10))
    const result = tierGames(games)
    expect(result.xl[0].appid).toBe(1) // 1000 min, index 0
    expect(result.l[0].appid).toBe(2) // 990 min, index 1
    expect(result.m[0].appid).toBe(4) // 970 min, index 3
    expect(result.s[0].appid).toBe(7) // 940 min, index 6
  })
})
