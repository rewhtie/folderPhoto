import type { Collections } from '../shared/collections/model.js'
import type {
  ScanImagesOptions,
  ScanImagesResult,
  SelectDirectoryResult,
} from '../shared/common/contracts/image-library.js'
import type { OwnedGamesResult } from '../shared/common/contracts/owned-games.js'
import type { TierList } from '../shared/tier-list/model.js'

export interface ExportResult {
  copied: number
  skipped: number
  failed: string[]
}

export interface SteamCollection {
  name: string
  appIds: string[]
}

export interface SteamSettings {
  apiKey: string
  steamId: string
}

export interface Achievement {
  id: string
  name: string
  description: string
  iconUrl: string
  iconGrayUrl: string
  achieved: boolean
  unlockTime: number | null
}

export interface AchievementResult {
  source: 'local' | 'api'
  achievements: Achievement[]
}

export interface AchievementIcon {
  id: string
  iconUrl: string
  iconGrayUrl: string
}

export interface CacheIconsResult {
  cached: number
  skipped: number
  failed: number
  directory: string
}

export interface DesktopApi {
  scanImages(directoryPath: string, options?: ScanImagesOptions): Promise<ScanImagesResult>
  loadSteamCollections(librarycacheDir: string): Promise<SteamCollection[]>
  selectDirectory(): Promise<SelectDirectoryResult>
  loadCollections(): Promise<Collections>
  saveCollections(collections: Collections): Promise<void>
  chooseExportDirectory(): Promise<string | null>
  exportImages(targetDirectory: string, absolutePaths: string[]): Promise<ExportResult>
  saveCollage(buffer: ArrayBuffer, suggestedName: string): Promise<string | null>
  pickLocalImages(options?: { multiple?: boolean }): Promise<string[] | null>
  loadSettings(): Promise<SteamSettings>
  saveSettings(settings: SteamSettings): Promise<void>
  fetchApiAchievements(appId: string): Promise<AchievementResult & { error?: string }>
  cacheAchievementIcons(
    appId: string,
    gameName: string,
    icons: AchievementIcon[],
  ): Promise<CacheIconsResult>
  openAchievementCacheDir(appId: string, gameName: string): Promise<void>
  fetchOwnedGames(force?: boolean): Promise<OwnedGamesResult>
  loadTierList(): Promise<TierList>
  saveTierList(list: TierList): Promise<void>
}
