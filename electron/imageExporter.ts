import { access, copyFile, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'

export interface ExportResult {
  copied: number
  skipped: number
  failed: string[]
}

export async function exportImages(targetDirectory: string, absolutePaths: string[]): Promise<ExportResult> {
  await mkdir(targetDirectory, { recursive: true })

  const result: ExportResult = { copied: 0, skipped: 0, failed: [] }
  const usedNames = new Set<string>()

  for (const sourcePath of absolutePaths) {
    const fileName = uniqueName(exportNameFor(sourcePath), usedNames)
    const destinationPath = join(targetDirectory, fileName)

    if (await fileExists(destinationPath)) {
      result.skipped += 1
      continue
    }

    try {
      await copyFile(sourcePath, destinationPath)
      result.copied += 1
    } catch {
      result.failed.push(sourcePath)
    }
  }

  return result
}

// 用 AppID 作为导出文件名：AppID 是路径中的纯数字目录名（兼容深层 hash 子文件夹）
function exportNameFor(absolutePath: string): string {
  const segments = absolutePath.split(/[\\/]/).filter(Boolean)
  const fileName = segments[segments.length - 1] ?? ''
  const dot = fileName.lastIndexOf('.')
  const ext = dot === -1 ? '' : fileName.slice(dot)

  const appId = segments.find((segment) => /^\d+$/.test(segment)) ?? segments[segments.length - 2] ?? 'image'
  return `${appId}${ext}`
}

function uniqueName(fileName: string, usedNames: Set<string>): string {
  if (!usedNames.has(fileName)) {
    usedNames.add(fileName)
    return fileName
  }

  const dot = fileName.lastIndexOf('.')
  const base = dot === -1 ? fileName : fileName.slice(0, dot)
  const ext = dot === -1 ? '' : fileName.slice(dot)

  let counter = 1
  let candidate = `${base}_${counter}${ext}`
  while (usedNames.has(candidate)) {
    counter += 1
    candidate = `${base}_${counter}${ext}`
  }

  usedNames.add(candidate)
  return candidate
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}
