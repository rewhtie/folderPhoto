import { access, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { toImageSourceUrl } from './imageProtocol.js'
import { loadAppNames } from './appManifest.js'
import { loadAppInfoEntries } from './appInfoStore.js'
import type { AppInfoEntry } from './appInfoParser.js'
import type { ImageAsset, ScanImagesResult, ScanImagesOptions } from '../src/shared/imageLibrary.js'
import { SCAN_KEYWORDS } from '../src/shared/imageNameConfig.js'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])

export async function scanImages(
  directoryPath: string,
  options: ScanImagesOptions = {},
): Promise<ScanImagesResult> {
  const trimmedPath = directoryPath.trim()

  if (!trimmedPath) {
    throw new Error('请输入目录路径')
  }

  const absoluteDirectoryPath = resolve(trimmedPath)

  try {
    await access(absoluteDirectoryPath, constants.F_OK)
  } catch {
    throw new Error('目录不存在')
  }

  const directoryStat = await stat(absoluteDirectoryPath)
  if (!directoryStat.isDirectory()) {
    throw new Error('路径不是文件夹')
  }

  const appInfoEntries = await loadAppInfoEntries(absoluteDirectoryPath)
  const acfNames = await loadAppNames(absoluteDirectoryPath)

  const includeDlc = options.includeDlc ?? false

  const images: ImageAsset[] = []
  await collectLibraryHeroImages(absoluteDirectoryPath, absoluteDirectoryPath, images, appInfoEntries, acfNames, includeDlc)

  images.sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  return { images }
}

function appIdFromRelativePath(relativePath: string): string {
  const segments = relativePath.split(/[\\/]/).filter(Boolean)
  return segments.find((segment) => /^\d+$/.test(segment)) ?? ''
}

function isDlc(appId: string, entries: Record<string, AppInfoEntry>): boolean {
  const info = entries[appId]
  return info?.type?.toLowerCase() === 'dlc'
}

async function collectLibraryHeroImages(
  rootPath: string,
  currentPath: string,
  images: ImageAsset[],
  appInfoEntries: Record<string, AppInfoEntry>,
  acfNames: Record<string, string>,
  includeDlc: boolean,
): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(currentPath)
  } catch {
    throw new Error('无法读取目录，请检查权限')
  }

  for (const entry of entries.sort((a, b) => a.localeCompare(b))) {
    const absolutePath = join(currentPath, entry)
    let entryStat
    try {
      entryStat = await stat(absolutePath)
    } catch {
      throw new Error('无法读取目录，请检查权限')
    }

    if (entryStat.isDirectory()) {
      await collectLibraryHeroImages(rootPath, absolutePath, images, appInfoEntries, acfNames, includeDlc)
      continue
    }

    if (!entryStat.isFile()) {
      continue
    }

    const extension = extname(entry).toLowerCase()
    const normalizedName = entry.toLowerCase()
    if (!IMAGE_EXTENSIONS.has(extension) || !SCAN_KEYWORDS.some((keyword) => keyword === normalizedName)) {
      continue
    }

    const relativePath = relative(rootPath, absolutePath)
    const appId = appIdFromRelativePath(relativePath)

    if (!includeDlc && appId && isDlc(appId, appInfoEntries)) {
      continue
    }

    const appName = acfNames[appId] ?? appInfoEntries[appId]?.name ?? ''

    images.push({
      name: entry,
      absolutePath,
      fileUrl: toImageSourceUrl(absolutePath),
      extension,
      sizeBytes: entryStat.size,
      relativePath,
      groupName: entry,
      appId,
      appName,
    })
  }
}
