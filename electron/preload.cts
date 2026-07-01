import { contextBridge, ipcRenderer } from 'electron'
import type { ScanImagesResult, SelectDirectoryResult } from '../src/shared/imageLibrary.js'

contextBridge.exposeInMainWorld('imageLibrary', {
  scanImages(directoryPath: string): Promise<ScanImagesResult> {
    return ipcRenderer.invoke('image-library:scan-images', directoryPath)
  },
  selectDirectory(): Promise<SelectDirectoryResult> {
    return ipcRenderer.invoke('image-library:select-directory')
  },
})
