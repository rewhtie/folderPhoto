/// <reference types="vite/client" />

import type { ScanImagesResult, SelectDirectoryResult } from './shared/imageLibrary'

declare global {
  interface Window {
    imageLibrary: {
      scanImages(directoryPath: string): Promise<ScanImagesResult>
      selectDirectory(): Promise<SelectDirectoryResult>
    }
  }
}

export {}
