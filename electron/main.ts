import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanImages } from './imageScanner.js'
import { imageSourceUrlToFileUrl } from './imageProtocol.js'
import { loadCollections, saveCollections, setCollectionsFilePath } from './collectionsStore.js'
import { exportImages } from './imageExporter.js'
import { loadSteamCollections } from './steamCollections.js'
import type { Collections } from '../src/shared/collections.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 收藏夹存储位置：打包后放 exe 同级目录，开发时放项目根目录，均不写入 C 盘系统目录
const packagedDirectory = process.env.PORTABLE_EXECUTABLE_DIR ?? dirname(app.getPath('exe'))
const collectionsDirectory = app.isPackaged ? packagedDirectory : join(__dirname, '..', '..')
setCollectionsFilePath(join(collectionsDirectory, 'collections.json'))

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-image',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
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

  void mainWindow.loadFile(join(__dirname, '../dist/index.html'))
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

  if (result.canceled || result.filePath.length === 0) {
    return null
  }

  const { writeFile } = await import('node:fs/promises')
  await writeFile(result.filePath, Buffer.from(buffer))
  return result.filePath
})

app.whenReady().then(() => {
  protocol.handle('local-image', (request) => net.fetch(imageSourceUrlToFileUrl(request.url)))

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
