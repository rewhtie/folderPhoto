import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Collections } from '../src/shared/collections.js'

let collectionsFilePath = join(process.cwd(), 'collections.json')

export function setCollectionsFilePath(filePath: string): void {
  collectionsFilePath = filePath
}

export async function loadCollections(): Promise<Collections> {
  try {
    const raw = await readFile(collectionsFilePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return isValidCollections(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export async function saveCollections(collections: Collections): Promise<void> {
  await writeFile(collectionsFilePath, JSON.stringify(collections, null, 2), 'utf-8')
}

function isValidCollections(value: unknown): value is Collections {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  return Object.values(value as Record<string, unknown>).every(
    (item) => Array.isArray(item) && item.every((path) => typeof path === 'string'),
  )
}
