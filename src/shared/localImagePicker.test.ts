import { afterEach, describe, expect, test, vi } from 'vitest'
import { pickLocalImages } from './localImagePicker'

describe('pickLocalImages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('uses the Electron image picker when the preload bridge is available', async () => {
    const pickFromElectron = vi.fn().mockResolvedValue(['local-image://file/cover.png'])
    vi.stubGlobal('window', {
      imageLibrary: { pickLocalImages: pickFromElectron },
    })
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('browser picker should not be created')
      },
    })

    await expect(pickLocalImages()).resolves.toEqual(['local-image://file/cover.png'])
  })

  test('falls back to a browser file input and returns data URLs', async () => {
    const files = [{ name: 'cover.png' }, { name: 'hero.jpg' }] as File[]
    const input = {
      accept: '',
      multiple: false,
      files,
      onchange: null as (() => void) | null,
      click() {
        this.onchange?.()
      },
    }

    class TestFileReader {
      result: string | ArrayBuffer | null = null
      error: DOMException | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      readAsDataURL(file: File): void {
        this.result = `data:image/test;base64,${file.name}`
        this.onload?.()
      }
    }

    vi.stubGlobal('window', {})
    vi.stubGlobal('document', { createElement: () => input })
    vi.stubGlobal('FileReader', TestFileReader)

    await expect(pickLocalImages()).resolves.toEqual([
      'data:image/test;base64,cover.png',
      'data:image/test;base64,hero.jpg',
    ])
    expect(input.accept).toBe('image/*')
    expect(input.multiple).toBe(true)
  })

  test('limits the browser picker to one file when requested', async () => {
    const input = {
      accept: '',
      multiple: true,
      files: [] as File[],
      onchange: null as (() => void) | null,
      click() {
        this.onchange?.()
      },
    }

    vi.stubGlobal('window', {})
    vi.stubGlobal('document', { createElement: () => input })

    await expect(pickLocalImages({ multiple: false })).resolves.toEqual([])
    expect(input.multiple).toBe(false)
  })
})
