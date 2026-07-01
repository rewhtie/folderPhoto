/// <reference types="vite/client" />

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
    }
  }
}

export {}
