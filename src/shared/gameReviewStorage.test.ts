import { describe, expect, it } from 'vitest'
import {
  loadGameReviews,
  mergeGamesWithStoredReviews,
  saveGameReviews,
  type StoredGameReview,
} from './gameReviewStorage'

function createStorage(initialValue: string | null = null): Pick<Storage, 'getItem' | 'setItem'> & {
  saved: Map<string, string>
} {
  const saved = new Map<string, string>()
  if (initialValue !== null) saved.set('steam-image-browser-game-review-drafts', initialValue)

  return {
    saved,
    getItem(key: string) {
      return saved.get(key) ?? null
    },
    setItem(key: string, value: string) {
      saved.set(key, value)
    },
  }
}

const review: StoredGameReview = {
  appName: '示例游戏',
  type: ['卡牌'],
  experience: '值得反复游玩',
  duration: '42',
  rating: 5,
  recommendation: 'S',
}

describe('game review storage', () => {
  it('按 AppID 恢复游戏名和测评字段，但不存储封面', () => {
    const storage = createStorage(JSON.stringify({ version: 2, reviews: { '10': review } }))

    expect(loadGameReviews(storage)).toEqual({ '10': review })
  })

  it('兼容旧版仅含测评字段的数据', () => {
    const { appName: _appName, ...draft } = review
    const storage = createStorage(JSON.stringify({ version: 1, drafts: { '10': draft } }))

    expect(loadGameReviews(storage)).toEqual({
      '10': {
        appName: '未知游戏',
        ...draft,
      },
    })
  })

  it('忽略损坏的记录并为无效字段使用默认值', () => {
    const storage = createStorage(
      JSON.stringify({
        version: 2,
        reviews: {
          '10': {
            appName: '示例游戏',
            coverUrl: 'local-image://不应恢复',
            type: ['卡牌', 1],
            experience: 123,
            duration: null,
            rating: 20,
            recommendation: 'A',
          },
          '20': null,
        },
      }),
    )

    expect(loadGameReviews(storage)).toEqual({
      '10': {
        appName: '示例游戏',
        type: ['卡牌'],
        experience: '',
        duration: '',
        rating: 0,
        recommendation: 'A',
      },
    })
  })

  it('将当前选择的封面与历史测评按 AppID 合并', () => {
    expect(
      mergeGamesWithStoredReviews(
        [{ appId: '10', appName: '当前名称', coverUrl: 'local-image://current-cover' }],
        {
          '10': review,
          '20': { ...review, appName: '历史游戏' },
        },
      ),
    ).toEqual([
      { appId: '10', appName: '当前名称', coverUrl: 'local-image://current-cover' },
      { appId: '20', appName: '历史游戏', coverUrl: '' },
    ])
  })

  it('当前封面只有 AppID 时保留历史游戏名', () => {
    expect(
      mergeGamesWithStoredReviews(
        [{ appId: '10', appName: '10', coverUrl: 'local-image://current-cover' }],
        { '10': review },
      ),
    ).toEqual([
      { appId: '10', appName: '示例游戏', coverUrl: 'local-image://current-cover' },
    ])
  })

  it('当前封面有真实游戏名时替换历史未知名称', () => {
    expect(
      mergeGamesWithStoredReviews(
        [{ appId: '10', appName: '当前名称', coverUrl: 'local-image://current-cover' }],
        { '10': { ...review, appName: '未知游戏' } },
      ),
    ).toEqual([
      { appId: '10', appName: '当前名称', coverUrl: 'local-image://current-cover' },
    ])
  })

  it('保存完整历史列表，并允许删除不再需要的记录', () => {
    const storage = createStorage(JSON.stringify({ version: 2, reviews: { '10': review } }))
    const newerReview: StoredGameReview = {
      appName: '另一个游戏',
      type: ['解谜'],
      experience: '新记录',
      duration: '8',
      rating: 4,
      recommendation: 'A+',
    }

    saveGameReviews(storage, { '20': newerReview })

    expect(loadGameReviews(storage)).toEqual({ '20': newerReview })
  })
})
