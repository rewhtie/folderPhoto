import { access, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { toImageSourceUrl } from './imageProtocol.js'
import type { ImageAsset, ScanImagesResult } from '../src/shared/imageLibrary.js'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])
const IMAGE_NAME_KEYWORDS = ['library_hero', 'header_schinese', 'header']

export async function scanImages(directoryPath: string): Promise<ScanImagesResult> {
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

  const images: ImageAsset[] = []
  await collectLibraryHeroImages(absoluteDirectoryPath, absoluteDirectoryPath, images)

  images.sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  return { images }
}

async function collectLibraryHeroImages(rootPath: string, currentPath: string, images: ImageAsset[]): Promise<void> {
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
      await collectLibraryHeroImages(rootPath, absolutePath, images)
      continue
    }

    if (!entryStat.isFile()) {
      continue
    }

    const extension = extname(entry).toLowerCase()
    const normalizedName = entry.toLowerCase()
    if (!IMAGE_EXTENSIONS.has(extension) || !IMAGE_NAME_KEYWORDS.some((keyword) => normalizedName.includes(keyword))) {
      continue
    }

    images.push({
      name: entry,
      absolutePath,
      fileUrl: toImageSourceUrl(absolutePath),
      extension,
      sizeBytes: entryStat.size,
      relativePath: relative(rootPath, absolutePath),
      groupName: entry,
    })
  }
}
