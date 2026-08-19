import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { emptyTierList, type TierList } from '../src/shared/tierList.js'

let tierListFilePath = join(process.cwd(), 'tierList.json')

export function setTierListFilePath(filePath: string): void {
  tierListFilePath = filePath
}

export async function loadTierList(): Promise<TierList> {
  try {
    const raw = await readFile(tierListFilePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return isValidTierList(parsed) ? normalize(parsed) : emptyTierList()
  } catch {
    return emptyTierList()
  }
}

export async function saveTierList(list: TierList): Promise<void> {
  await writeFile(tierListFilePath, JSON.stringify(list, null, 2), 'utf-8')
}

function isValidTierList(value: unknown): value is Partial<TierList> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalize(parsed: Partial<TierList>): TierList {
  const base = emptyTierList()
  for (const key of Object.keys(base) as (keyof TierList)[]) {
    const arr = parsed[key]
    if (Array.isArray(arr)) base[key] = arr.filter(isTierEntry)
  }
  return base
}

function isTierEntry(value: unknown): value is TierList[keyof TierList][number] {
  if (typeof value !== 'object' || value === null) return false
  const o = value as { id?: unknown; src?: unknown; label?: unknown }
  return typeof o.id === 'string' && typeof o.src === 'string' && typeof o.label === 'string'
}