import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  setAchievementCacheBaseDir,
  loadCachedAchievements,
  saveAchievementCache,
} from './achievementStore.js'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'ach-test-'))
  setAchievementCacheBaseDir(tempDir)
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('achievement cache', () => {
  it('loadCachedAchievements returns null when no cache exists', async () => {
    const result = await loadCachedAchievements('123')
    expect(result).toBeNull()
  })

  it('save + load round-trips correctly', async () => {
    const data = {
      source: 'api' as const,
      achievements: [
        {
          id: 'ACH_1',
          name: 'Test',
          description: 'desc',
          iconUrl: 'https://example.com/icon.jpg',
          iconGrayUrl: 'https://example.com/gray.jpg',
          achieved: true,
          unlockTime: 1700000000,
        },
      ],
    }
    await saveAchievementCache('456', data)

    const loaded = await loadCachedAchievements('456')
    expect(loaded).toEqual(data)
  })

  it('loadCachedAchievements returns null on corrupt JSON', async () => {
    await mkdir(join(tempDir, 'achievements'), { recursive: true })
    await writeFile(join(tempDir, 'achievements', '789.json'), 'not json!!!')

    const result = await loadCachedAchievements('789')
    expect(result).toBeNull()
  })
})
