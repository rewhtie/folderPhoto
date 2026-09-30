import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import type { Collections } from '../shared/collections/model'
import type { ScanImagesResult } from '../shared/common/contracts/image-library'
import type { OwnedGamesResult } from '../shared/common/contracts/owned-games'
import type { TierList } from '../shared/tier-list/model'
import type {
  AchievementResult,
  CacheIconsResult,
  DesktopApi,
  ExportResult,
  SteamCollection,
  SteamSettings,
} from './desktop-api'

function localImageUrl(path: string): string {
  return convertFileSrc(path, 'steam-image')
}

function selectedPaths(value: string | string[] | null): string[] {
  if (value === null) return []
  return Array.isArray(value) ? value : [value]
}

function scanWithLocalUrls(result: ScanImagesResult): ScanImagesResult {
  return {
    images: result.images.map((image) => ({
      ...image,
      fileUrl: localImageUrl(image.absolutePath),
    })),
  }
}

export function createTauriDesktopApi(): DesktopApi {
  return {
    async scanImages(directoryPath, options) {
      const result = await invoke<ScanImagesResult>('scan_images', {
        directoryPath,
        options: options ?? {},
      })
      return scanWithLocalUrls(result)
    },

    loadSteamCollections(librarycacheDir) {
      return invoke<SteamCollection[]>('load_steam_collections', { librarycacheDir })
    },

    async selectDirectory() {
      const selected = await open({ directory: true, multiple: false })
      return typeof selected === 'string' ? selected : null
    },

    loadCollections() {
      return invoke<Collections>('load_collections')
    },

    saveCollections(collections) {
      return invoke('save_collections', { collections })
    },

    chooseExportDirectory() {
      return invoke<string | null>('choose_export_directory')
    },

    exportImages(targetDirectory, absolutePaths) {
      return invoke<ExportResult>('export_images', { targetDirectory, absolutePaths })
    },

    async saveCollage(buffer, suggestedName) {
      const extension = suggestedName.toLowerCase().endsWith('.jpg')
        || suggestedName.toLowerCase().endsWith('.jpeg')
        ? ['jpg', 'jpeg']
        : ['png']
      const path = await save({
        defaultPath: suggestedName,
        filters: [{ name: extension[0].toUpperCase(), extensions: extension }],
      })
      if (!path) return null
      await writeFile(path, new Uint8Array(buffer))
      return path
    },

    async pickLocalImages(options) {
      const selected = await open({
        directory: false,
        multiple: options?.multiple ?? true,
        filters: [{
          name: '图片',
          extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'],
        }],
      })
      const paths = selectedPaths(selected)
      if (paths.length === 0) return null
      const authorized = await invoke<string[]>('authorize_local_images', { paths })
      return authorized.map(localImageUrl)
    },

    loadSettings() {
      return invoke<SteamSettings>('load_settings')
    },

    saveSettings(settings) {
      return invoke<void>('save_settings', { settings })
    },

    fetchApiAchievements(appId) {
      return invoke<AchievementResult & { error?: string }>('fetch_api_achievements', { appId })
    },

    cacheAchievementIcons(appId, gameName, icons) {
      return invoke<CacheIconsResult>('cache_achievement_icons', { appId, gameName, icons })
    },

    openAchievementCacheDir(appId, gameName) {
      return invoke<void>('open_achievement_cache_dir', { appId, gameName })
    },

    fetchOwnedGames(force) {
      return invoke<OwnedGamesResult>('fetch_owned_games', { force: force ?? false })
    },

    loadTierList() {
      return invoke<TierList>('load_tier_list')
    },

    saveTierList(list) {
      return invoke<void>('save_tier_list', { list })
    },
  }
}
