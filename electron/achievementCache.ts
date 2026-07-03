import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

let baseDirectory = ''

export function setAchievementsBaseDir(dir: string): void {
  baseDirectory = join(dir, 'achievements')
}

// 清理文件名中不允许的字符
function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim()
}

// 从 URL 推断文件扩展名，默认 .jpg
function urlExtension(url: string): string {
  try {
    const ext = extname(new URL(url).pathname)
    if (ext && ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext
  } catch { /* ignore */ }
  return '.jpg'
}

// 单个文件是否已缓存
async function isCached(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export interface CacheIconsResult {
  cached: number
  skipped: number
  failed: number
  directory: string
}

/**
 * 批量下载成就图标到本地缓存目录
 * achievements/<appId>_<游戏名>/<成就id>.<ext>
 */
export async function cacheAchievementIcons(
  appId: string,
  gameName: string,
  icons: Array<{ id: string; iconUrl: string; iconGrayUrl: string }>,
): Promise<CacheIconsResult> {
  const dirName = `${appId}_${sanitize(gameName || appId)}`
  const cacheDir = join(baseDirectory, dirName)
  await mkdir(cacheDir, { recursive: true })

  let cached = 0
  let skipped = 0
  let failed = 0

  for (const icon of icons) {
    for (const url of [icon.iconUrl, icon.iconGrayUrl]) {
      if (!url) continue

      const suffix = url === icon.iconGrayUrl ? '_gray' : ''
      const fileName = `${icon.id}${suffix}${urlExtension(url)}`
      const filePath = join(cacheDir, fileName)

      if (await isCached(filePath)) {
        skipped++
        continue
      }

      try {
        const response = await fetch(url)
        if (!response.ok) { failed++; continue }
        const buffer = Buffer.from(await response.arrayBuffer())
        await writeFile(filePath, buffer)
        cached++
      } catch {
        failed++
      }
    }
  }

  return { cached, skipped, failed, directory: cacheDir }
}

/**
 * 返回指定游戏的成就缓存目录路径（不检查是否存在）
 */
export function getAchievementCacheDir(appId: string, gameName: string): string {
  const dirName = `${appId}_${sanitize(gameName || appId)}`
  return join(baseDirectory, dirName)
}

/**
 * 列出指定游戏已缓存的成就图标文件名
 */
export async function listCachedIcons(appId: string, gameName: string): Promise<string[]> {
  const dirName = `${appId}_${sanitize(gameName || appId)}`
  const cacheDir = join(baseDirectory, dirName)
  try {
    return await readdir(cacheDir)
  } catch {
    return []
  }
}
