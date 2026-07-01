import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanImages } from './imageScanner'

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'image-scanner-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('scanImages', () => {
  it('rejects an empty path', async () => {
    await expect(scanImages('   ')).rejects.toThrow('请输入目录路径')
  })

  it('rejects a missing directory', async () => {
    await expect(scanImages(join(tmpdir(), 'missing-image-dir'))).rejects.toThrow('目录不存在')
  })

  it('rejects a file path', async () => {
    const dir = await createTempDir()
    const filePath = join(dir, 'file.txt')
    await writeFile(filePath, 'not a directory')

    await expect(scanImages(filePath)).rejects.toThrow('路径不是文件夹')
  })


  it('converts first-level entry stat failures to the directory read error', async () => {
    const dir = await createTempDir()
    await mkdir(join(dir, 'broken.jpg'))
    const scan = scanImages(dir)
    await rm(join(dir, 'broken.jpg'), { recursive: true, force: true })

    await expect(scan).rejects.toThrow('无法读取目录，请检查权限')
  })

  it('returns first-level image files sorted by name', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, 'b.PNG'), 'png')
    await writeFile(join(dir, 'a.jpg'), 'jpg')
    await writeFile(join(dir, 'notes.txt'), 'text')
    await mkdir(join(dir, 'nested'))
    await writeFile(join(dir, 'nested', 'hidden.jpg'), 'jpg')

    const result = await scanImages(dir)

    expect(result.images).toHaveLength(2)
    expect(result.images.map((image) => image.name)).toEqual(['a.jpg', 'b.PNG'])
    expect(result.images[0]).toMatchObject({
      absolutePath: join(dir, 'a.jpg'),
      extension: '.jpg',
      sizeBytes: 3,
    })
    expect(result.images[0].fileUrl).toMatch(/^file:\/\//)
  })
})
