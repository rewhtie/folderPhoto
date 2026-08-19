export type TierKey = '夯' | '顶级' | '人上人' | 'NPC' | '拉' | 'pool'

export const TIER_ORDER: readonly TierKey[] = ['夯', '顶级', '人上人', 'NPC', '拉']

export interface TierEntry {
  id: string
  src: string
  label: string
}

export interface TierList {
  夯: TierEntry[]
  顶级: TierEntry[]
  人上人: TierEntry[]
  NPC: TierEntry[]
  拉: TierEntry[]
  pool: TierEntry[]
}

export function emptyTierList(): TierList {
  return { 夯: [], 顶级: [], 人上人: [], NPC: [], 拉: [], pool: [] }
}

function clone(list: TierList): TierList {
  return {
    夯: [...list.夯],
    顶级: [...list.顶级],
    人上人: [...list.人上人],
    NPC: [...list.NPC],
    拉: [...list.拉],
    pool: [...list.pool],
  }
}

export function addToPool(list: TierList, entry: TierEntry): TierList {
  if (list.pool.some((x) => x.id === entry.id)) return list
  const next = clone(list)
  next.pool.push(entry)
  return next
}

export function moveEntry(
  list: TierList,
  fromTier: TierKey,
  fromIdx: number,
  toTier: TierKey,
  toIdx: number,
): TierList {
  const next = clone(list)
  const from = next[fromTier]
  if (fromIdx < 0 || fromIdx >= from.length) return list
  const [moved] = from.splice(fromIdx, 1)
  const to = next[toTier]
  const insertAt = Math.max(0, Math.min(toIdx, to.length))
  to.splice(insertAt, 0, moved)
  return next
}

export function tierLabelFromUrl(src: string, fallback = ''): string {
  try {
    const url = new URL(src)
    const encoded = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname
    const full = decodeURIComponent(encoded)
    const name = full.split(/[\\/]/).pop() ?? ''
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.slice(0, dot) : name || fallback
  } catch {
    return fallback
  }
}