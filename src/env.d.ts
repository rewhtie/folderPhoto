/// <reference types="vite/client" />
/// <reference types="unocss/preset-uno" />

import type { ScanImagesResult, SelectDirectoryResult } from './shared/imageLibrary'
import type { Collections } from './shared/collections'
import type { OwnedGamesResult } from './shared/ownedGames'

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
  iconGrayUrl: string
  achieved: boolean
  unlockTime: number | null
}

interface AchievementResult {
  source: 'local' | 'api'
  achievements: Achievement[]
}

interface CacheIconsResult {
  cached: number
  skipped: number
  failed: number
  directory: string
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
      fetchApiAchievements(appId: string): Promise<AchievementResult & { error?: string }>
      cacheAchievementIcons(appId: string, gameName: string, icons: Array<{ id: string; iconUrl: string; iconGrayUrl: string }>): Promise<CacheIconsResult>
      openAchievementCacheDir(appId: string, gameName: string): Promise<void>
      fetchOwnedGames(force?: boolean): Promise<OwnedGamesResult>
    }
  }
}

export {}
