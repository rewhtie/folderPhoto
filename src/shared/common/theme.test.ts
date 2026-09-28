import { describe, expect, it } from 'vitest'
import { getSavedTheme, nextTheme, saveTheme } from './theme'

function createStorage(initialValue: string | null = null): Pick<Storage, 'getItem' | 'setItem'> & {
  saved: Map<string, string>
} {
  const saved = new Map<string, string>()
  if (initialValue !== null) saved.set('steam-image-browser-theme', initialValue)

  return {
    saved,
    getItem(key: string) {
      return saved.get(key) ?? null
    },
    setItem(key: string, value: string) {
      saved.set(key, value)
    },
  }
}

describe('theme preference', () => {
  it('defaults to dark when no valid preference has been saved', () => {
    expect(getSavedTheme(createStorage())).toBe('dark')
    expect(getSavedTheme(createStorage('unknown'))).toBe('dark')
  })

  it('restores a saved light preference', () => {
    expect(getSavedTheme(createStorage('light'))).toBe('light')
  })

  it('switches between dark and light', () => {
    expect(nextTheme('dark')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
  })

  it('persists the selected theme', () => {
    const storage = createStorage()

    saveTheme('light', storage)

    expect(storage.saved.get('steam-image-browser-theme')).toBe('light')
  })
})
