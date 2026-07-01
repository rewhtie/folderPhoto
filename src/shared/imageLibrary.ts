export interface ImageAsset {
  name: string
  absolutePath: string
  fileUrl: string
  extension: string
  sizeBytes: number
  relativePath: string
  groupName: string
  appId: string
  appName: string
}

export interface ScanImagesResult {
  images: ImageAsset[]
}

export interface ScanImagesOptions {
  includeDlc?: boolean
}

export type SelectDirectoryResult = string | null
