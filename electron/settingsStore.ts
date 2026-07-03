import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface SteamSettings {
  apiKey: string
  steamId: string
}

let settingsFilePath = join(process.cwd(), 'settings.json')

export function setSettingsFilePath(filePath: string): void {
  settingsFilePath = filePath
}

const DEFAULT_SETTINGS: SteamSettings = { apiKey: '', steamId: '' }

export async function loadSettings(): Promise<SteamSettings> {
  try {
    const raw = await readFile(settingsFilePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return isValidSettings(parsed) ? parsed : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(settings: SteamSettings): Promise<void> {
  await writeFile(settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8')
}

function isValidSettings(value: unknown): value is SteamSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const v = value as Record<string, unknown>
  return typeof v.apiKey === 'string' && typeof v.steamId === 'string'
}
