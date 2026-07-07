import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanImages } from './imageScanner.js'
import { imageSourceUrlToFileUrl } from './imageProtocol.js'
import { loadCollections, saveCollections, setCollectionsFilePath } from './collectionsStore.js'
import { loadSettings, saveSettings, setSettingsFilePath } from './settingsStore.js'
import {
  fetchApiAchievements,
  loadLocalAchievements,
  setAchievementCacheBaseDir,
  loadCachedAchievements,
  saveAchievementCache,
} from './achievementStore.js'
import {
  fetchOwnedGamesWithLibrary,
  loadCachedOwnedGames,
  saveOwnedGamesCache,
  setOwnedGamesCacheBaseDir,
} from './ownedGamesStore.js'
import { setAchievementsBaseDir, cacheAchievementIcons, getAchievementCacheDir } from './achievementCache.js'
import { exportImages } from './imageExporter.js'
import { loadSteamCollections } from './steamCollections.js'
import type { Collections } from '../src/shared/collections.js'
import type { SteamSettings } from './settingsStore.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 数据存储位置：
// - portable 版：放 exe 同级目录（PORTABLE_EXECUTABLE_DIR）
// - 安装版：放 userData（%APPDATA%/SteamImageBrowser），避免 Program Files 无写权限
// - 开发时：放项目根目录
const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR
const collectionsDirectory = isPortable
  ? process.env.PORTABLE_EXECUTABLE_DIR!
  : app.isPackaged
    ? app.getPath('userData')
    : join(__dirname, '..', '..')
setCollectionsFilePath(join(collectionsDirectory, 'collections.json'))
setSettingsFilePath(join(collectionsDirectory, 'settings.json'))
setAchievementsBaseDir(collectionsDirectory)
setAchievementCacheBaseDir(collectionsDirectory)
setOwnedGamesCacheBaseDir(collectionsDirectory)

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-image',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      // 拼图导出需要 canvas.toBlob：跨源图片必须走 CORS 才不会污染画布
      corsEnabled: true,
    },
  },
])

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.setMenuBarVisibility(false)

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
    return
  }

  void mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
}

ipcMain.handle('image-library:scan-images', (_event, directoryPath: string, options: { includeDlc?: boolean }) => {
  return scanImages(directoryPath, options ?? {})
})

ipcMain.handle('steam-collections:load', (_event, librarycacheDir: string) => {
  return loadSteamCollections(librarycacheDir)
})

ipcMain.handle('image-library:select-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择图片文件夹',
    properties: ['openDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('collections:load', () => {
  return loadCollections()
})

ipcMain.handle('collections:save', (_event, collections: Collections) => {
  return saveCollections(collections)
})

ipcMain.handle('collections:choose-export-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择导出目录',
    properties: ['openDirectory', 'createDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('collections:export-images', (_event, targetDirectory: string, absolutePaths: string[]) => {
  return exportImages(targetDirectory, absolutePaths)
})

ipcMain.handle('collage:save', async (_event, buffer: ArrayBuffer, suggestedName: string) => {
  const result = await dialog.showSaveDialog({
    title: '保存拼图',
    defaultPath: suggestedName,
    filters: [
      { name: 'PNG', extensions: ['png'] },
      { name: 'JPG', extensions: ['jpg', 'jpeg'] },
    ],
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  await writeFile(result.filePath, Buffer.from(buffer))
  return result.filePath
})

ipcMain.handle('settings:load', () => {
  return loadSettings()
})

ipcMain.handle('settings:save', (_event, settings: SteamSettings) => {
  return saveSettings(settings)
})

ipcMain.handle('achievements:load-local', (_event, librarycacheDir: string, appId: string) => {
  return loadLocalAchievements(librarycacheDir, appId)
})

ipcMain.handle('achievements:fetch-api', async (_event, appId: string) => {
  // 先查缓存
  const cached = await loadCachedAchievements(appId)
  if (cached) return cached

  // 缓存未命中，走 API
  const settings = await loadSettings()
  if (!settings.apiKey || !settings.steamId) {
    return { source: 'api' as const, achievements: [], error: '未配置 Web API' }
  }
  try {
    const result = await fetchApiAchievements(appId, settings.apiKey, settings.steamId)
    // 只缓存成功结果（有成就数据的），错误不缓存
    if (result.achievements.length > 0) {
      await saveAchievementCache(appId, result)
    }
    return result
  } catch (err) {
    return {
      source: 'api' as const,
      achievements: [],
      error: err instanceof Error ? err.message : '请求失败',
    }
  }
})

ipcMain.handle('achievements:cache-icons', async (_event, appId: string, gameName: string, icons: Array<{ id: string; iconUrl: string; iconGrayUrl: string }>) => {
  return cacheAchievementIcons(appId, gameName, icons)
})

ipcMain.handle('achievements:open-cache-dir', async (_event, appId: string, gameName: string) => {
  const dir = getAchievementCacheDir(appId, gameName)
  await shell.openPath(dir)
})

ipcMain.handle('owned-games:fetch', async (_event, force?: boolean) => {
  if (!force) {
    const cached = await loadCachedOwnedGames()
    if (cached) return { games: cached }
  }

  const settings = await loadSettings()
  if (!settings.apiKey || !settings.steamId) {
    return { games: [], error: '未配置 Web API' }
  }
  try {
    const defaultLibraryCache = 'C:\\Program Files (x86)\\Steam\\appcache\\librarycache'
    const games = await fetchOwnedGamesWithLibrary(settings.apiKey, settings.steamId, defaultLibraryCache)
    await saveOwnedGamesCache(games)
    return { games }
  } catch (err) {
    return {
      games: [],
      error: err instanceof Error ? err.message : '请求失败',
    }
  }
})

app.whenReady().then(() => {
  protocol.handle('local-image', async (request) => {
    const response = await net.fetch(imageSourceUrlToFileUrl(request.url))
    // 显式带上 CORS 头，配合 img.crossOrigin='anonymous' 让 canvas 不被污染
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
