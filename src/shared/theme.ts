export type Theme = 'dark' | 'light'

const THEME_STORAGE_KEY = 'steam-image-browser-theme'

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>

export function getSavedTheme(storage: ThemeStorage): Theme {
  return storage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

export function nextTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark'
}

export function saveTheme(theme: Theme, storage: ThemeStorage): void {
  storage.setItem(THEME_STORAGE_KEY, theme)
}
