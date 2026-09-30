/// <reference types="vite/client" />
/// <reference types="unocss/preset-uno" />

import type { DesktopApi } from './platform/desktop-api.js'

declare global {
  interface Window {
    imageLibrary: DesktopApi
  }
}

export {}
