# Folder Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a system folder picker so users can choose the image directory instead of relying on the default Steam path.

**Architecture:** Electron main process owns the native dialog and exposes it through IPC. The preload script adds a narrow `window.imageLibrary.selectDirectory()` API. Vue adds a “选择文件夹” button that fills the path and scans the selected directory.

**Tech Stack:** Electron, Vue 3, TypeScript, Vite, Vitest.

## Global Constraints

- Keep manual path input.
- Add a system folder picker button.
- Use Electron `dialog.showOpenDialog` with `properties: ['openDirectory']`.
- Return `string | null` from folder selection: selected absolute path or `null` when the user cancels.
- Do not auto-open the picker on startup.
- Do not add recursive scanning.
- Do not add Steam AppID recognition, Steam game matching, network downloads, cache management, image editing, deletion, or moving.
- If the user cancels folder selection, keep the current path, image list, and state unchanged.
- If the user selects a folder, fill the input and automatically scan that folder.
- Renderer must not directly access Node.js `fs`, `path`, Electron dialog, or other native APIs.
- Default path remains `C:\Program Files (x86)\Steam\appcache\librarycache`.

---

## File Structure

- `src/shared/imageLibrary.ts`: add `SelectDirectoryResult` type alias.
- `electron/main.ts`: add IPC handler `image-library:select-directory` using Electron dialog.
- `electron/preload.ts`: expose `selectDirectory(): Promise<string | null>`.
- `src/env.d.ts`: add renderer type declaration for `selectDirectory`.
- `src/App.vue`: add “选择文件夹” button, selection handler, and improved missing-directory hint.

---

### Task 1: Folder Picker IPC and Types

**Files:**
- Modify: `src/shared/imageLibrary.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/env.d.ts`

**Interfaces:**
- Consumes existing `window.imageLibrary.scanImages(directoryPath: string): Promise<ScanImagesResult>`.
- Produces `SelectDirectoryResult = string | null`.
- Produces IPC channel `image-library:select-directory`.
- Produces `window.imageLibrary.selectDirectory(): Promise<SelectDirectoryResult>`.

- [ ] **Step 1: Add shared selection result type**

Modify `src/shared/imageLibrary.ts` to this full content:

```ts
export interface ImageAsset {
  name: string
  absolutePath: string
  fileUrl: string
  extension: string
  sizeBytes: number
}

export interface ScanImagesResult {
  images: ImageAsset[]
}

export type SelectDirectoryResult = string | null
```

- [ ] **Step 2: Add Electron dialog IPC handler**

Modify `electron/main.ts` to this full content:

```ts
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanImages } from './imageScanner.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
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
```

- [ ] **Step 3: Expose preload API**

Modify `electron/preload.ts` to this full content:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { ScanImagesResult, SelectDirectoryResult } from '../src/shared/imageLibrary.js'

contextBridge.exposeInMainWorld('imageLibrary', {
  scanImages(directoryPath: string): Promise<ScanImagesResult> {
    return ipcRenderer.invoke('image-library:scan-images', directoryPath)
  },
  selectDirectory(): Promise<SelectDirectoryResult> {
    return ipcRenderer.invoke('image-library:select-directory')
  },
})
```

- [ ] **Step 4: Update renderer global types**

Modify `src/env.d.ts` to this full content:

```ts
/// <reference types="vite/client" />

import type { ScanImagesResult, SelectDirectoryResult } from './shared/imageLibrary'

declare global {
  interface Window {
    imageLibrary: {
      scanImages(directoryPath: string): Promise<ScanImagesResult>
      selectDirectory(): Promise<SelectDirectoryResult>
    }
  }
}

export {}
```

- [ ] **Step 5: Run checks and commit**

Run:

```bash
npm test
npm run build
```

Expected:

- `npm test` passes with 2 test files and 8 tests.
- `npm run build` passes.

Commit:

```bash
git add src/shared/imageLibrary.ts electron/main.ts electron/preload.ts src/env.d.ts
git commit -m "feat: add folder picker ipc"
```

---

### Task 2: Folder Picker UI Flow

**Files:**
- Modify: `src/App.vue`

**Interfaces:**
- Consumes `window.imageLibrary.selectDirectory(): Promise<string | null>`.
- Consumes existing `scanImages(directoryPath: string): Promise<void>` UI flow.
- Produces user behavior: “选择文件夹” fills the input and scans selected folder; cancel preserves current state.

- [ ] **Step 1: Update Vue script**

In `src/App.vue`, update the `<script setup lang="ts">` block to this full content:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatFileSize } from './shared/format'
import type { ImageAsset } from './shared/imageLibrary'

const DEFAULT_LIBRARYCACHE_PATH = 'C:\\Program Files (x86)\\Steam\\appcache\\librarycache'

const directoryPath = ref(DEFAULT_LIBRARYCACHE_PATH)
const images = ref<ImageAsset[]>([])
const errorMessage = ref('')
const isLoading = ref(false)
const isSelectingDirectory = ref(false)
const hasScanned = ref(false)

const imageCountLabel = computed(() => `${images.value.length} 张图片`)

async function scanImages(pathToScan = directoryPath.value): Promise<void> {
  errorMessage.value = ''
  isLoading.value = true
  hasScanned.value = true

  try {
    const result = await window.imageLibrary.scanImages(pathToScan)
    images.value = result.images
  } catch (error) {
    images.value = []
    const message = error instanceof Error ? error.message : '读取目录失败'
    errorMessage.value = message === '目录不存在' ? '目录不存在，你也可以点击“选择文件夹”。' : message
  } finally {
    isLoading.value = false
  }
}

async function selectDirectory(): Promise<void> {
  isSelectingDirectory.value = true

  try {
    const selectedPath = await window.imageLibrary.selectDirectory()

    if (selectedPath === null) {
      return
    }

    directoryPath.value = selectedPath
    await scanImages(selectedPath)
  } catch {
    errorMessage.value = '选择文件夹失败'
  } finally {
    isSelectingDirectory.value = false
  }
}
</script>
```

- [ ] **Step 2: Update form buttons**

In `src/App.vue`, replace the existing `<div class="path-row">...</div>` inside the form with this exact block:

```vue
<div class="path-row">
  <input
    id="directoryPath"
    v-model="directoryPath"
    type="text"
    placeholder="请输入本地目录路径"
    autocomplete="off"
  />
  <button class="secondary-button" type="button" :disabled="isLoading || isSelectingDirectory" @click="selectDirectory">
    {{ isSelectingDirectory ? '选择中...' : '选择文件夹' }}
  </button>
  <button type="submit" :disabled="isLoading || isSelectingDirectory">
    {{ isLoading ? '读取中...' : '读取图片' }}
  </button>
</div>
```

- [ ] **Step 3: Add secondary button styles**

In `src/App.vue`, add this CSS after the existing `button { ... }` rule:

```css
.secondary-button {
  color: #dbeafe;
  background: rgba(59, 130, 246, 0.22);
  border: 1px solid rgba(147, 197, 253, 0.34);
}
```

- [ ] **Step 4: Run checks and commit**

Run:

```bash
npm test
npm run build
```

Expected:

- `npm test` passes with 2 test files and 8 tests.
- `npm run build` passes.

Commit:

```bash
git add src/App.vue
git commit -m "feat: add folder picker ui"
```

---

### Task 3: Final Verification

**Files:**
- Modify only if verification finds defects in files changed by Tasks 1-2.

**Interfaces:**
- Consumes complete folder picker implementation.
- Produces verified build and documented manual test results.

- [ ] **Step 1: Run automated checks**

Run:

```bash
npm test
npm run build
```

Expected:

- `npm test` passes with 2 test files and 8 tests.
- `npm run build` passes.

- [ ] **Step 2: Run the app**

Run:

```bash
npm run dev:electron
```

Expected:

- Electron window opens.
- Path input is visible.
- “选择文件夹” button is visible between the input and “读取图片”.

- [ ] **Step 3: Verify cancel behavior**

In the app:

1. Click “选择文件夹”.
2. Cancel the system dialog.

Expected:

- Existing input value remains unchanged.
- Existing image list and state remain unchanged.
- No error is shown.

- [ ] **Step 4: Verify selected folder behavior**

In the app:

1. Click “选择文件夹”.
2. Select a folder containing supported images.

Expected:

- Input updates to the selected path.
- App automatically scans the folder.
- Image grid appears with preview, file name, and file size.

- [ ] **Step 5: Verify empty folder behavior**

In the app:

1. Click “选择文件夹”.
2. Select an empty folder.

Expected:

- Input updates to the selected path.
- App automatically scans the folder.
- Page shows `该目录下没有可展示的图片。`.

- [ ] **Step 6: Commit verification fixes if needed**

If fixes were needed, commit them:

```bash
git add electron src
git commit -m "fix: address folder picker verification issues"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: folder picker IPC, preload API, renderer type declarations, UI button, auto-scan on selection, cancel no-op behavior, missing-directory hint, automated checks, and manual checks are covered.
- Placeholder scan: no TBD, TODO, “similar to”, or unspecified implementation remains.
- Type consistency: `SelectDirectoryResult`, `selectDirectory`, and `image-library:select-directory` are named consistently across shared types, main process, preload, environment declarations, and Vue.
