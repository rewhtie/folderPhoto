import { describe, expect, it } from 'vitest'
import { parseSteamCollections } from './steamCollections'

describe('parseSteamCollections', () => {
  it('extracts user collections with name and added appids', () => {
    const data = [
      ['showcases.2', { value: '{"foo":"bar"}' }],
      [
        'user-collections.uc-abc',
        {
          value: JSON.stringify({
            id: 'uc-abc',
            name: '26年通关记录',
            added: [10, 20, 30],
            removed: [],
          }),
        },
      ],
      [
        'user-collections.uc-other',
        {
          value: JSON.stringify({
            id: 'uc-other',
            name: '收藏夹2',
            added: [100],
            removed: [999],
          }),
        },
      ],
    ]

    expect(parseSteamCollections(data)).toEqual([
      { name: '26年通关记录', appIds: ['10', '20', '30'] },
      { name: '收藏夹2', appIds: ['100'] },
    ])
  })

  it('skips entries that are not user collections', () => {
    const data = [
      ['showcases.2', { value: '{}' }],
      ['some-other-key', { value: '{}' }],
    ]

    expect(parseSteamCollections(data)).toEqual([])
  })

  it('skips malformed entries without throwing', () => {
    const data = [
      ['user-collections.broken', { value: 'not-json' }],
      ['user-collections.empty', {}],
    ]

    expect(parseSteamCollections(data)).toEqual([])
  })
})
