import { describe, expect, it } from 'vitest'
import type { ImageAsset } from './imageLibrary'
import { selectedGamesForReview } from './gameReview'

function image(overrides: Partial<ImageAsset>): ImageAsset {
  return {
    name: 'header.jpg',
    absolutePath: 'C:\\images\\header.jpg',
    fileUrl: 'local-image://file/header.jpg',
    extension: '.jpg',
    sizeBytes: 1024,
    relativePath: 'header.jpg',
    groupName: 'header',
    appId: '10',
    appName: '示例游戏',
    ...overrides,
  }
}

describe('selectedGamesForReview', () => {
  it('只返回已选游戏并按 AppID 去重，保留首张图片作为封面', () => {
    const images = [
      image({ absolutePath: 'C:\\images\\a.jpg', fileUrl: 'local-image://file/a.jpg' }),
      image({ absolutePath: 'C:\\images\\b.jpg', fileUrl: 'local-image://file/b.jpg' }),
      image({
        absolutePath: 'C:\\images\\c.jpg',
        fileUrl: 'local-image://file/c.jpg',
        appId: '20',
        appName: '另一个游戏',
      }),
    ]

    const games = selectedGamesForReview(
      images,
      new Set(['C:\\images\\a.jpg', 'C:\\images\\b.jpg', 'C:\\images\\c.jpg']),
    )

    expect(games).toEqual([
      { appId: '10', appName: '示例游戏', coverUrl: 'local-image://file/a.jpg' },
      { appId: '20', appName: '另一个游戏', coverUrl: 'local-image://file/c.jpg' },
    ])
  })

  it('忽略未选中的图片', () => {
    const images = [
      image({ absolutePath: 'C:\\images\\selected.jpg' }),
      image({ absolutePath: 'C:\\images\\ignored.jpg', appId: '20' }),
    ]

    expect(selectedGamesForReview(images, new Set(['C:\\images\\selected.jpg']))).toHaveLength(1)
  })

  it('忽略没有 AppID 的图片', () => {
    const images = [
      image({
        absolutePath: 'C:\\images\\unknown-a.jpg',
        appId: '',
        appName: '',
      }),
      image({
        absolutePath: 'C:\\images\\unknown-b.jpg',
        appId: '',
        appName: '',
      }),
    ]

    expect(
      selectedGamesForReview(
        images,
        new Set(['C:\\images\\unknown-a.jpg', 'C:\\images\\unknown-b.jpg']),
      ),
    ).toEqual([])
  })
})
