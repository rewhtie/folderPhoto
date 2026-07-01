import { describe, expect, it } from 'vitest'
import { imageSourceUrlToFileUrl, toImageSourceUrl } from './imageProtocol'

describe('image protocol URL helpers', () => {
  it('round trips a Windows path through the local image protocol', () => {
    const path = 'C:\\Program Files (x86)\\Steam\\appcache\\librarycache\\10\\library_hero.jpg'

    const sourceUrl = toImageSourceUrl(path)

    expect(sourceUrl).toBe('local-image://file/C%3A%5CProgram%20Files%20(x86)%5CSteam%5Cappcache%5Clibrarycache%5C10%5Clibrary_hero.jpg')
    expect(imageSourceUrlToFileUrl(sourceUrl)).toBe('file:///C:/Program%20Files%20(x86)/Steam/appcache/librarycache/10/library_hero.jpg')
  })
})
