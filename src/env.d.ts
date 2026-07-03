/// <reference types="vite/client" />
/// <reference types="unocss/preset-uno" />

import type { ScanImagesResult, SelectDirectoryResult } from './shared/imageLibrary'
import type { Collections } from './shared/collections'

interface ExportResult {
  copied: number
  skipped: number
  failed: string[]
}

interface SteamCollection {
  name: string
  appIds: string[]
}

interface SteamSettings {
  apiKey: string
  steamId: string
}

interface Achievement {
  id: string
  name: string
  description: string
  iconUrl: string
  achieved: boolean
  unlockTime: number | null
}

interface AchievementResult {
  source: 'local' | 'api'
  achievements: Achievement[]
}

declare global {
  interface Window {
    imageLibrary: {
      scanImages(directoryPath: string, options?: { includeDlc?: boolean }): Promise<ScanImagesResult>
      loadSteamCollections(librarycacheDir: string): Promise<SteamCollection[]>
      selectDirectory(): Promise<SelectDirectoryResult>
      loadCollections(): Promise<Collections>
      saveCollections(collections: Collections): Promise<void>
      chooseExportDirectory(): Promise<string | null>
      exportImages(targetDirectory: string, absolutePaths: string[]): Promise<ExportResult>
      saveCollage(buffer: ArrayBuffer, suggestedName: string): Promise<string | null>
      loadSettings(): Promise<SteamSettings>
      saveSettings(settings: SteamSettings): Promise<void>
      loadLocalAchievements(librarycacheDir: string, appId: string): Promise<AchievementResult>
      fetchApiAchievements(appId: string): Promise<AchievementResult & { error?: string }>
    }
  }
}

export {}
