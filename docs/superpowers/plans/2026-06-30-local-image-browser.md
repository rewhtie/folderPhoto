# Local Image Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal Electron + Vue 3 + TypeScript app that scans a user-entered local directory and displays image files in a grid.

**Architecture:** Electron owns all filesystem access in the main process. The preload script exposes a narrow `window.imageLibrary.scanImages(directoryPath)` API. Vue calls that API, manages loading/error/empty states, and renders image cards from returned `file://` URLs.

**Tech Stack:** Electron, Vue 3, TypeScript, Vite, Vitest.

## Global Constraints

- Initialize the project in the current `d:\project\steamPC` directory.
- Support manual path input only; do not add a system folder picker.
- Scan only the selected directory's first-level files; do not recurse into subdirectories.
- Support image extensions `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, and `.bmp`.
- Do not implement Steam AppID recognition, Steam game name matching, network cover downloads, image cache management, image editing, deletion, or moving.
- The default input path must be `C:\Program Files (x86)\Steam\appcache\librarycache`.
- The renderer must not directly access Node.js `fs` or `path` APIs.
- Show loading state, error state, empty state, image count, image preview, file name, and file size.

---

## File Structure

- `package.json`: scripts, dependencies, and project metadata.
- `tsconfig.json`: shared strict TypeScript settings.
- `tsconfig.node.json`: TypeScript settings for Electron main and preload files.
- `vite.config.ts`: Vite config for Vue renderer and Vitest.
- `index.html`: renderer entry HTML.
- `electron/main.ts`: Electron app lifecycle, browser window creation, IPC registration.
- `electron/preload.ts`: safe bridge from renderer to IPC.
- `electron/imageScanner.ts`: filesystem scanning logic, validation, image filtering, and `file://` URL creation.
- `electron/imageScanner.test.ts`: unit tests for directory scanning and error behavior.
- `src/main.ts`: Vue app bootstrap.
- `src/App.vue`: single-page UI for path input, status display, and image grid.
- `src/env.d.ts`: Vite and preload API type declarations.
- `src/shared/imageLibrary.ts`: shared `ImageAsset` and `ScanImagesResult` types.
- `src/shared/format.ts`: renderer helper for human-readable file sizes.
- `src/shared/format.test.ts`: unit tests for file-size formatting.
- `.gitignore`: ignore dependencies, build outputs, and runtime files.

---

### Task 1: Project Scaffold and Shared Types

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `.gitignore`
- Create: `src/main.ts`
- Create: `src/env.d.ts`
- Create: `src/shared/imageLibrary.ts`
- Create: `src/shared/format.ts`
- Create: `src/shared/format.test.ts`

**Interfaces:**
- Produces: `ImageAsset` type with `name`, `absolutePath`, `fileUrl`, `extension`, and `sizeBytes`.
- Produces: `ScanImagesResult` type with `images: ImageAsset[]`.
- Produces: `formatFileSize(sizeBytes: number): string`.

- [ ] **Step 1: Create package metadata and scripts**

Create `package.json` with this content:

```json
{
  "name": "steam-pc-local-image-browser",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "dev:electron": "concurrently -k \"npm run dev\" \"wait-on tcp:5173 && cross-env VITE_DEV_SERVER_URL=http://127.0.0.1:5173 electron .\"",
    "build": "vue-tsc --noEmit && vite build && tsc -p tsconfig.node.json",
    "test": "vitest run",
    "typecheck": "vue-tsc --noEmit && tsc -p tsconfig.node.json --noEmit"
  },
  "dependencies": {
    "@vitejs/plugin-vue": "latest",
    "electron": "latest",
    "vue": "latest"
  },
  "devDependencies": {
    "@types/node": "latest",
    "@vue/tsconfig": "latest",
    "concurrently": "latest",
    "cross-env": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vitest": "latest",
    "vue-tsc": "latest",
    "wait-on": "latest"
  }
}
```

- [ ] **Step 2: Create TypeScript configs**

Create `tsconfig.json`:

```json
{
  "extends": "@vue/tsconfig/tsconfig.dom.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.vue", "electron/**/*.test.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist-electron",
    "rootDir": ".",
    "types": ["node", "vitest/globals"]
  },
  "include": ["electron/**/*.ts", "src/shared/**/*.ts", "vite.config.ts"]
}
```

- [ ] **Step 3: Create Vite config and HTML entry**

Create `vite.config.ts`:

```ts
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts'],
  },
})
```

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>本地图片资源浏览器</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Create ignore rules**

Create `.gitignore`:

```gitignore
node_modules/
dist/
dist-electron/
.vite/
*.log
.DS_Store
```

- [ ] **Step 5: Create shared image types**

Create `src/shared/imageLibrary.ts`:

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
```

- [ ] **Step 6: Create file-size formatter test**

Create `src/shared/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatFileSize } from './format'

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(512)).toBe('512 B')
  })

  it('formats kibibytes', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('formats mebibytes', () => {
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2 MB')
  })
})
```

- [ ] **Step 7: Run formatter test to verify it fails**

Run: `npm install` then `npm test -- src/shared/format.test.ts`

Expected: install succeeds, then test fails because `src/shared/format.ts` does not exist.

- [ ] **Step 8: Implement file-size formatter**

Create `src/shared/format.ts`:

```ts
const UNITS = ['B', 'KB', 'MB', 'GB'] as const

export function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return '0 B'
  }

  let value = sizeBytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(1)
  return `${rounded} ${UNITS[unitIndex]}`
}
```

- [ ] **Step 9: Create Vue bootstrap and environment types**

Create `src/main.ts`:

```ts
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

Create `src/env.d.ts`:

```ts
/// <reference types="vite/client" />

import type { ScanImagesResult } from './shared/imageLibrary'

declare global {
  interface Window {
    imageLibrary: {
      scanImages(directoryPath: string): Promise<ScanImagesResult>
    }
  }
}

export {}
```

- [ ] **Step 10: Run tests and commit**

Run: `npm test -- src/shared/format.test.ts`

Expected: PASS for all 3 formatter tests.

Run: `npm run typecheck`

Expected: typecheck may fail because `src/App.vue` and Electron files are not created yet. If the failure only reports missing `src/App.vue`, continue; Task 4 completes typecheck.

Commit:

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html .gitignore src/main.ts src/env.d.ts src/shared/imageLibrary.ts src/shared/format.ts src/shared/format.test.ts
git commit -m "chore: scaffold electron vue image browser"
```

---

### Task 2: Image Scanner Service

**Files:**
- Create: `electron/imageScanner.ts`
- Create: `electron/imageScanner.test.ts`

**Interfaces:**
- Consumes: `ImageAsset` and `ScanImagesResult` from `src/shared/imageLibrary.ts`.
- Produces: `scanImages(directoryPath: string): Promise<ScanImagesResult>`.
- Produces user-facing error messages: `请输入目录路径`, `目录不存在`, `路径不是文件夹`, `无法读取目录，请检查权限`.

- [ ] **Step 1: Write failing image scanner tests**

Create `electron/imageScanner.test.ts`:

```ts
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanImages } from './imageScanner'

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'image-scanner-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('scanImages', () => {
  it('rejects an empty path', async () => {
    await expect(scanImages('   ')).rejects.toThrow('请输入目录路径')
  })

  it('rejects a missing directory', async () => {
    await expect(scanImages(join(tmpdir(), 'missing-image-dir'))).rejects.toThrow('目录不存在')
  })

  it('rejects a file path', async () => {
    const dir = await createTempDir()
    const filePath = join(dir, 'file.txt')
    await writeFile(filePath, 'not a directory')

    await expect(scanImages(filePath)).rejects.toThrow('路径不是文件夹')
  })

  it('returns first-level image files sorted by name', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, 'b.PNG'), 'png')
    await writeFile(join(dir, 'a.jpg'), 'jpg')
    await writeFile(join(dir, 'notes.txt'), 'text')
    await mkdir(join(dir, 'nested'))
    await writeFile(join(dir, 'nested', 'hidden.jpg'), 'jpg')

    const result = await scanImages(dir)

    expect(result.images).toHaveLength(2)
    expect(result.images.map((image) => image.name)).toEqual(['a.jpg', 'b.PNG'])
    expect(result.images[0]).toMatchObject({
      absolutePath: join(dir, 'a.jpg'),
      extension: '.jpg',
      sizeBytes: 3,
    })
    expect(result.images[0].fileUrl).toMatch(/^file:\/\//)
  })
})
```

- [ ] **Step 2: Run scanner tests to verify they fail**

Run: `npm test -- electron/imageScanner.test.ts`

Expected: FAIL because `electron/imageScanner.ts` does not exist.

- [ ] **Step 3: Implement image scanner**

Create `electron/imageScanner.ts`:

```ts
import { access, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ImageAsset, ScanImagesResult } from '../src/shared/imageLibrary'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])

export async function scanImages(directoryPath: string): Promise<ScanImagesResult> {
  const trimmedPath = directoryPath.trim()

  if (!trimmedPath) {
    throw new Error('请输入目录路径')
  }

  const absoluteDirectoryPath = resolve(trimmedPath)

  try {
    await access(absoluteDirectoryPath, constants.F_OK)
  } catch {
    throw new Error('目录不存在')
  }

  const directoryStat = await stat(absoluteDirectoryPath)
  if (!directoryStat.isDirectory()) {
    throw new Error('路径不是文件夹')
  }

  let entries: string[]
  try {
    entries = await readdir(absoluteDirectoryPath)
  } catch {
    throw new Error('无法读取目录，请检查权限')
  }

  const images: ImageAsset[] = []

  for (const entry of entries.sort((a, b) => a.localeCompare(b))) {
    const absolutePath = join(absoluteDirectoryPath, entry)
    const entryStat = await stat(absolutePath)

    if (!entryStat.isFile()) {
      continue
    }

    const extension = extname(entry).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(extension)) {
      continue
    }

    images.push({
      name: entry,
      absolutePath,
      fileUrl: pathToFileURL(absolutePath).toString(),
      extension,
      sizeBytes: entryStat.size,
    })
  }

  return { images }
}
```

- [ ] **Step 4: Run scanner tests and commit**

Run: `npm test -- electron/imageScanner.test.ts`

Expected: PASS for all scanner tests.

Commit:

```bash
git add electron/imageScanner.ts electron/imageScanner.test.ts
git commit -m "feat: add local image scanner"
```

---

### Task 3: Electron Main and Preload IPC

**Files:**
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Modify: `src/env.d.ts`

**Interfaces:**
- Consumes: `scanImages(directoryPath: string): Promise<ScanImagesResult>` from `electron/imageScanner.ts`.
- Produces IPC channel `image-library:scan-images`.
- Produces renderer API `window.imageLibrary.scanImages(directoryPath): Promise<ScanImagesResult>`.

- [ ] **Step 1: Implement Electron main process**

Create `electron/main.ts`:

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
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

- [ ] **Step 2: Implement preload bridge**

Create `electron/preload.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { ScanImagesResult } from '../src/shared/imageLibrary'

contextBridge.exposeInMainWorld('imageLibrary', {
  scanImages(directoryPath: string): Promise<ScanImagesResult> {
    return ipcRenderer.invoke('image-library:scan-images', directoryPath)
  },
})
```

- [ ] **Step 3: Confirm renderer type declarations**

Ensure `src/env.d.ts` still contains this exact declaration:

```ts
/// <reference types="vite/client" />

import type { ScanImagesResult } from './shared/imageLibrary'

declare global {
  interface Window {
    imageLibrary: {
      scanImages(directoryPath: string): Promise<ScanImagesResult>
    }
  }
}

export {}
```

- [ ] **Step 4: Run typecheck for Electron files and commit**

Run: `npx tsc -p tsconfig.node.json --noEmit`

Expected: PASS.

Commit:

```bash
git add electron/main.ts electron/preload.ts src/env.d.ts
git commit -m "feat: expose image scanning ipc"
```

---

### Task 4: Vue Image Browser UI

**Files:**
- Create: `src/App.vue`

**Interfaces:**
- Consumes: `window.imageLibrary.scanImages(directoryPath): Promise<ScanImagesResult>`.
- Consumes: `formatFileSize(sizeBytes: number): string`.
- Produces visible UI states: input, button, loading state, error state, empty state, image count, image grid.

- [ ] **Step 1: Create Vue app UI**

Create `src/App.vue`:

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
const hasScanned = ref(false)

const imageCountLabel = computed(() => `${images.value.length} 张图片`)

async function scanImages(): Promise<void> {
  errorMessage.value = ''
  isLoading.value = true
  hasScanned.value = true

  try {
    const result = await window.imageLibrary.scanImages(directoryPath.value)
    images.value = result.images
  } catch (error) {
    images.value = []
    errorMessage.value = error instanceof Error ? error.message : '读取目录失败'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <main class="page-shell">
    <section class="hero-panel">
      <p class="eyebrow">Electron + Vue 3 + TypeScript</p>
      <h1>本地图片资源浏览器</h1>
      <p class="description">
        输入一个本地文件夹路径，读取当前目录下的图片资源，并以网格形式展示预览。
      </p>

      <form class="path-form" @submit.prevent="scanImages">
        <label for="directoryPath">图片目录路径</label>
        <div class="path-row">
          <input
            id="directoryPath"
            v-model="directoryPath"
            type="text"
            placeholder="请输入本地目录路径"
            autocomplete="off"
          />
          <button type="submit" :disabled="isLoading">
            {{ isLoading ? '读取中...' : '读取图片' }}
          </button>
        </div>
      </form>
    </section>

    <section class="content-panel" aria-live="polite">
      <div v-if="errorMessage" class="state-card error-state">
        {{ errorMessage }}
      </div>

      <div v-else-if="isLoading" class="state-card">
        正在读取目录，请稍候...
      </div>

      <div v-else-if="hasScanned && images.length === 0" class="state-card">
        该目录下没有可展示的图片。
      </div>

      <template v-else-if="images.length > 0">
        <div class="result-header">
          <h2>扫描结果</h2>
          <span>{{ imageCountLabel }}</span>
        </div>

        <div class="image-grid">
          <article v-for="image in images" :key="image.absolutePath" class="image-card">
            <div class="preview-frame">
              <img :src="image.fileUrl" :alt="image.name" loading="lazy" />
            </div>
            <div class="image-meta">
              <strong :title="image.name">{{ image.name }}</strong>
              <span>{{ formatFileSize(image.sizeBytes) }}</span>
            </div>
          </article>
        </div>
      </template>

      <div v-else class="state-card muted-state">
        输入目录路径后点击“读取图片”。
      </div>
    </section>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  min-width: 900px;
  min-height: 100vh;
  color: #e5edf7;
  background: #101827;
  font-family:
    Inter,
    'Segoe UI',
    'Microsoft YaHei',
    sans-serif;
}

.page-shell {
  min-height: 100vh;
  padding: 40px;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.22), transparent 34rem),
    linear-gradient(135deg, #101827 0%, #172033 48%, #0f172a 100%);
}

.hero-panel,
.content-panel {
  max-width: 1180px;
  margin: 0 auto;
}

.hero-panel {
  padding: 32px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 24px;
  background: rgba(15, 23, 42, 0.78);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
}

.eyebrow {
  margin: 0 0 10px;
  color: #93c5fd;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 12px;
  font-size: 36px;
}

.description {
  max-width: 720px;
  color: #b6c3d4;
  line-height: 1.7;
}

.path-form {
  margin-top: 28px;
}

.path-form label {
  display: block;
  margin-bottom: 10px;
  color: #cbd5e1;
  font-weight: 700;
}

.path-row {
  display: flex;
  gap: 12px;
}

input {
  flex: 1;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 14px;
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.86);
  font-size: 15px;
  outline: none;
}

input:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.18);
}

button {
  padding: 0 22px;
  border: 0;
  border-radius: 14px;
  color: #082f49;
  background: #7dd3fc;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.68;
}

.content-panel {
  margin-top: 24px;
}

.state-card {
  padding: 28px;
  border: 1px dashed rgba(148, 163, 184, 0.34);
  border-radius: 20px;
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.58);
  text-align: center;
}

.error-state {
  border-color: rgba(248, 113, 113, 0.52);
  color: #fecaca;
  background: rgba(127, 29, 29, 0.24);
}

.muted-state {
  color: #94a3b8;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.result-header h2 {
  margin: 0;
}

.result-header span {
  color: #93c5fd;
  font-weight: 800;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 18px;
}

.image-card {
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.74);
}

.preview-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
  background: rgba(2, 6, 23, 0.76);
}

.preview-frame img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.image-meta {
  display: grid;
  gap: 6px;
  padding: 12px;
}

.image-meta strong {
  overflow: hidden;
  color: #f8fafc;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-meta span {
  color: #94a3b8;
  font-size: 13px;
}
```

- [ ] **Step 2: Run typecheck and tests**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: PASS for formatter and scanner tests.

- [ ] **Step 3: Commit UI**

Commit:

```bash
git add src/App.vue
git commit -m "feat: add image browser ui"
```

---

### Task 5: Build and Manual Verification

**Files:**
- Modify only if verification finds a defect in files created by Tasks 1-4.

**Interfaces:**
- Consumes complete app from prior tasks.
- Produces verified build and manual behavior evidence.

- [ ] **Step 1: Run full automated checks**

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS and create `dist/` plus `dist-electron/`.

- [ ] **Step 2: Launch app for manual verification**

Run: `npm run dev:electron`

Expected: Electron window opens with title “本地图片资源浏览器”, default path `C:\Program Files (x86)\Steam\appcache\librarycache`, and a “读取图片” button.

- [ ] **Step 3: Verify missing path error**

In the app, enter:

```text
C:\definitely-missing-image-folder
```

Click “读取图片”.

Expected: page shows `目录不存在`.

- [ ] **Step 4: Verify file path error**

Create a temporary text file if needed:

```bash
printf 'hello' > /d/project/steamPC/manual-file-path-test.txt
```

In the app, enter:

```text
d:\project\steamPC\manual-file-path-test.txt
```

Click “读取图片”.

Expected: page shows `路径不是文件夹`.

- [ ] **Step 5: Verify empty directory state**

Create an empty directory if needed:

```bash
mkdir -p /d/project/steamPC/manual-empty-image-dir
```

In the app, enter:

```text
d:\project\steamPC\manual-empty-image-dir
```

Click “读取图片”.

Expected: page shows `该目录下没有可展示的图片。`.

- [ ] **Step 6: Verify image grid state**

Create a sample directory with a tiny SVG-like non-supported file and at least one supported image copied from an existing local image. If a local image is available in the Steam cache, use the Steam cache path directly:

```text
C:\Program Files (x86)\Steam\appcache\librarycache
```

Click “读取图片”.

Expected: page shows a positive image count and an image card grid. Each card shows a preview, file name, and size.

- [ ] **Step 7: Remove manual temporary files and commit final verification fixes if any**

Run:

```bash
rm -f /d/project/steamPC/manual-file-path-test.txt
rm -rf /d/project/steamPC/manual-empty-image-dir
```

If fixes were made during verification, commit them:

```bash
git add electron src package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html .gitignore
git commit -m "fix: address image browser verification issues"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: project scaffold, IPC, first-level directory scanning, supported image extensions, safe preload API, UI states, image count, image metadata, and verification scenarios are covered by Tasks 1-5.
- Placeholder scan: no TBD, TODO, or unspecified implementation steps remain.
- Type consistency: `ImageAsset`, `ScanImagesResult`, `scanImages`, and `window.imageLibrary.scanImages` use the same signatures across all tasks.
