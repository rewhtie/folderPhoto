import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanImages } from './imageScanner'

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'hero-scanner-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('scanImages library hero mode', () => {
  it('recursively returns library_hero and header_schinese images grouped by file name', async () => {
    const dir = await createTempDir()
    await mkdir(join(dir, '100'), { recursive: true })
    await mkdir(join(dir, '200', 'hash'), { recursive: true })
    await writeFile(join(dir, '100', 'library_hero.jpg'), 'hero')
    await writeFile(join(dir, '100', 'library_hero_blur.jpg'), 'blur')
    await writeFile(join(dir, '200', 'hash', 'library_hero_schinese.jpg'), 'zh')
    await writeFile(join(dir, '200', 'hash', 'header_schinese.jpg'), 'header')
    await writeFile(join(dir, '200', 'logo.jpg'), 'logo')

    const result = await scanImages(dir)

    expect(result.images.map((image) => image.name)).toEqual([
      'library_hero.jpg',
      'library_hero_blur.jpg',
      'library_hero_schinese.jpg',
      'header_schinese.jpg',
    ])
    expect(result.images.map((image) => image.groupName)).toEqual([
      'library_hero.jpg',
      'library_hero_blur.jpg',
      'library_hero_schinese.jpg',
      'header_schinese.jpg',
    ])
    expect(result.images.map((image) => image.relativePath)).toEqual([
      join('100', 'library_hero.jpg'),
      join('100', 'library_hero_blur.jpg'),
      join('200', 'hash', 'library_hero_schinese.jpg'),
      join('200', 'hash', 'header_schinese.jpg'),
    ])
  })
})
