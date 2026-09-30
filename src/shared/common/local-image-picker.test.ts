import { afterEach, describe, expect, test, vi } from 'vitest'
import { pickLocalImages } from './local-image-picker'

describe('pickLocalImages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('uses the desktop image picker and preserves its URLs', async () => {
    const pickFromDesktop = vi.fn().mockResolvedValue(['steam-image://file/cover.png'])
    vi.stubGlobal('window', {
      imageLibrary: { pickLocalImages: pickFromDesktop },
    })

    await expect(pickLocalImages()).resolves.toEqual(['steam-image://file/cover.png'])
    expect(pickFromDesktop).toHaveBeenCalledWith({})
  })

  test('forwards single-selection requests to the desktop picker', async () => {
    const pickFromDesktop = vi.fn().mockResolvedValue(['steam-image://file/cover.png'])
    vi.stubGlobal('window', {
      imageLibrary: { pickLocalImages: pickFromDesktop },
    })

    await expect(pickLocalImages({ multiple: false })).resolves.toEqual([
      'steam-image://file/cover.png',
    ])
    expect(pickFromDesktop).toHaveBeenCalledWith({ multiple: false })
  })

  test('normalizes a cancelled desktop picker to an empty list', async () => {
    const pickFromDesktop = vi.fn().mockResolvedValue(null)
    vi.stubGlobal('window', {
      imageLibrary: { pickLocalImages: pickFromDesktop },
    })

    await expect(pickLocalImages()).resolves.toEqual([])
  })
})
