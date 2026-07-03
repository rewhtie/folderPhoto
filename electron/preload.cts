import { contextBridge, ipcRenderer } from 'electron'
import type { ScanImagesResult, SelectDirectoryResult } from '../src/shared/imageLibrary.js'
import type { Collections } from '../src/shared/collections.js'
import type { ExportResult } from './imageExporter.js'
import type { SteamCollection } from './steamCollections.js'
import type { SteamSettings } from './settingsStore.js'
import type { AchievementResult } from './achievementStore.js'
import type { CacheIconsResult } from './achievementCache.js'

contextBridge.exposeInMainWorld('imageLibrary', {
  scanImages(directoryPath: string, options?: { includeDlc?: boolean }): Promise<ScanImagesResult> {
    return ipcRenderer.invoke('image-library:scan-images', directoryPath, options ?? {})
  },
  loadSteamCollections(librarycacheDir: string): Promise<SteamCollection[]> {
    return ipcRenderer.invoke('steam-collections:load', librarycacheDir)
  },
  selectDirectory(): Promise<SelectDirectoryResult> {
    return ipcRenderer.invoke('image-library:select-directory')
  },
  loadCollections(): Promise<Collections> {
    return ipcRenderer.invoke('collections:load')
  },
  saveCollections(collections: Collections): Promise<void> {
    return ipcRenderer.invoke('collections:save', collections)
  },
  chooseExportDirectory(): Promise<string | null> {
    return ipcRenderer.invoke('collections:choose-export-directory')
  },
  exportImages(targetDirectory: string, absolutePaths: string[]): Promise<ExportResult> {
    return ipcRenderer.invoke('collections:export-images', targetDirectory, absolutePaths)
  },
  saveCollage(buffer: ArrayBuffer, suggestedName: string): Promise<string | null> {
    return ipcRenderer.invoke('collage:save', buffer, suggestedName)
  },
  loadSettings(): Promise<SteamSettings> {
    return ipcRenderer.invoke('settings:load')
  },
  saveSettings(settings: SteamSettings): Promise<void> {
    return ipcRenderer.invoke('settings:save', settings)
  },
  fetchApiAchievements(appId: string): Promise<AchievementResult & { error?: string }> {
    return ipcRenderer.invoke('achievements:fetch-api', appId)
  },
  cacheAchievementIcons(appId: string, gameName: string, icons: Array<{ id: string; iconUrl: string; iconGrayUrl: string }>): Promise<CacheIconsResult> {
    return ipcRenderer.invoke('achievements:cache-icons', appId, gameName, icons)
  },
  openAchievementCacheDir(appId: string, gameName: string): Promise<void> {
    return ipcRenderer.invoke('achievements:open-cache-dir', appId, gameName)
  },
})
