import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  setOwnedGamesCacheBaseDir,
  loadCachedOwnedGames,
  saveOwnedGamesCache,
  parseOwnedGamesResponse,
} from './ownedGamesStore.js'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'owned-games-test-'))
  setOwnedGamesCacheBaseDir(tempDir)
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('parseOwnedGamesResponse', () => {
  it('extracts games from Steam API response', () => {
    const data = {
      response: {
        game_count: 2,
        games: [
          { appid: 730, name: 'CS2', playtime_forever: 600, img_icon_url: 'abc' },
          { appid: 440, name: 'TF2', playtime_forever: 120 },
        ],
      },
    }
    const result = parseOwnedGamesResponse(data)
    expect(result).toEqual([
      { appid: 730, name: 'CS2', playtimeForever: 600 },
      { appid: 440, name: 'TF2', playtimeForever: 120 },
    ])
  })

  it('returns empty when response.games is missing', () => {
    expect(parseOwnedGamesResponse({ response: {} })).toEqual([])
    expect(parseOwnedGamesResponse({})).toEqual([])
    expect(parseOwnedGamesResponse(null)).toEqual([])
  })

  it('defaults missing playtime to 0 and name to empty', () => {
    const data = { response: { games: [{ appid: 1 }] } }
    expect(parseOwnedGamesResponse(data)).toEqual([{ appid: 1, name: '', playtimeForever: 0 }])
  })
})

describe('owned games cache', () => {
  it('returns null when no cache exists', async () => {
    expect(await loadCachedOwnedGames()).toBeNull()
  })

  it('save + load round-trips', async () => {
    const games = [
      { appid: 730, name: 'CS2', playtimeForever: 600 },
      { appid: 440, name: 'TF2', playtimeForever: 120 },
    ]
    await saveOwnedGamesCache(games)
    expect(await loadCachedOwnedGames()).toEqual(games)
  })

  it('returns null on corrupt JSON', async () => {
    await writeFile(join(tempDir, 'owned-games.json'), 'not json!!!')
    expect(await loadCachedOwnedGames()).toBeNull()
  })

  it('returns null on invalid shape', async () => {
    await writeFile(join(tempDir, 'owned-games.json'), JSON.stringify([{ appid: 'not a number' }]))
    expect(await loadCachedOwnedGames()).toBeNull()
  })
})
