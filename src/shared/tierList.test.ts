import { describe, expect, it } from 'vitest'
import {
  addToPool,
  emptyTierList,
  moveEntry,
  tierLabelFromUrl,
  TIER_ORDER,
  type TierEntry,
  type TierList,
} from './tierList'

const e = (id: string): TierEntry => ({ id, src: `local-image://file/x/${id}.jpg`, label: id })

describe('emptyTierList', () => {
  it('返回全空档位', () => {
    const list = emptyTierList()
    expect(list).toEqual({ 夯: [], 顶级: [], 人上人: [], NPC: [], 拉: [], pool: [] })
  })
})

describe('addToPool', () => {
  it('追加到待分区末尾', () => {
    const list = emptyTierList()
    const next = addToPool(list, e('a'))
    expect(next.pool.map((x) => x.id)).toEqual(['a'])
  })
  it('按 id 去重', () => {
    const list = addToPool(emptyTierList(), e('a'))
    const next = addToPool(list, e('a'))
    expect(next.pool.length).toBe(1)
  })
  it('不改原对象', () => {
    const list = emptyTierList()
    const next = addToPool(list, e('a'))
    expect(list.pool.length).toBe(0)
    expect(next).not.toBe(list)
  })
})

describe('moveEntry', () => {
  const seeded: TierList = {
    pool: [e('p1'), e('p2')],
    夯: [e('s1'), e('s2')],
    顶级: [],
    人上人: [],
    NPC: [],
    拉: [],
  }
  it('跨档移动：pool[0] → 夯 末尾', () => {
    const next = moveEntry(seeded, 'pool', 0, '夯', 2)
    expect(next.pool.map((x) => x.id)).toEqual(['p2'])
    expect(next.夯.map((x) => x.id)).toEqual(['s1', 's2', 'p1'])
  })
  it('档内换序：夯[0] → 夯 末尾', () => {
    const next = moveEntry(seeded, '夯', 0, '夯', 2)
    expect(next.夯.map((x) => x.id)).toEqual(['s2', 's1'])
  })
})

describe('tierLabelFromUrl', () => {
  it('解析文件名去扩展名', () => {
    expect(tierLabelFromUrl('local-image://file/C%3A%5Cimg%5Celden-ring.jpg')).toBe('elden-ring')
  })
  it('无文件名用 fallback', () => {
    expect(tierLabelFromUrl('local-image://file/', '默认')).toBe('默认')
  })
  it('TIER_ORDER 顺序正确', () => {
    expect([...TIER_ORDER]).toEqual(['夯', '顶级', '人上人', 'NPC', '拉'])
  })
})