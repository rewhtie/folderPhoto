import { contextBridge, ipcRenderer } from 'electron'
import type { ScanImagesResult, SelectDirectoryResult } from '../src/shared/imageLibrary.js'
import type { Collections } from '../src/shared/collections.js'
import type { ExportResult } from './imageExporter.js'

contextBridge.exposeInMainWorld('imageLibrary', {
  scanImages(directoryPath: string, options?: { includeDlc?: boolean }): Promise<ScanImagesResult> {
    return ipcRenderer.invoke('image-library:scan-images', directoryPath, options ?? {})
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
})
