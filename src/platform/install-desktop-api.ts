import { isTauri } from '@tauri-apps/api/core'
import { createTauriDesktopApi } from './tauri-api'

export async function installDesktopApi(): Promise<void> {
  if (!isTauri()) {
    throw new Error('当前应用必须在 Tauri 环境中运行')
  }
  window.imageLibrary = createTauriDesktopApi()
}
