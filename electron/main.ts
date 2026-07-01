import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanImages } from './imageScanner.js'
import { imageSourceUrlToFileUrl } from './imageProtocol.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
    return
  }

  void mainWindow.loadFile(join(__dirname, '../dist/index.html'))
}

ipcMain.handle('image-library:scan-images', (_event, directoryPath: string) => {
  return scanImages(directoryPath)
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
