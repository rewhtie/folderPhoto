# 游戏详情页 + 成就功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每个游戏提供详情页（页面内切换），展示该游戏图片 + 按需加载成就（本地优先，否则提示配置 Web API），设置通过顶栏齿轮按钮管理。

**Architecture:** 主进程新增 settingsStore（settings.json）和 achievementStore（本地 stats 文件扫描 + Web API 请求）。渲染进程新增 GameDetail.vue（详情视图）和 SettingsDialog.vue（设置弹窗）。App.vue 加齿轮按钮 + 详情视图切换 + 卡片详情按钮。

**Tech Stack:** Electron IPC、Node fs、Vue 3 `<script setup>`、Vitest。

## Global Constraints

- 设置文件存 `<exe同级>/settings.json`，沿用 collectionsStore 模式（packaged 用 PORTABLE_EXECUTABLE_DIR，开发用项目根目录）。
- 成就按需加载，不进主扫描流程。
- 本地成就文件路径：`userdata/<account>/stats/UserGameStats_<appid>.json`，多账号遍历。
- Web API 请求在主进程发（不暴露 key 到渲染进程）。
- Web API endpoint：`ISteamUserStats/GetPlayerAchievements/v1/?key=xxx&steamid=xxx&appid=xxx`。
- 成就图标 URL：`http://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/<appid>/<iconhash>.jpg`（渲染进程 `<img src>` 直接加载）。
- 测试风格遵循 src/shared/format.test.ts（vitest, describe/it/expect）。
- 不重构现有主界面布局，只加详情切换层。
- 不缓存成就图标到本地。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `electron/settingsStore.ts` | 新建。load/save settings.json（apiKey + steamId）。 |
| `electron/settingsStore.test.ts` | 新建。settingsStore 单测。 |
| `electron/achievementStore.ts` | 新建。`loadLocalAchievements(appId)` 扫 userdata stats；`fetchApiAchievements(appId, apiKey, steamId)` 调 Web API。纯解析逻辑抽 `parseUserGameStats` 可单测。 |
| `electron/achievementStore.test.ts` | 新建。`parseUserGameStats` 单测。 |
| `electron/main.ts` | 新增 IPC：`settings:load`、`settings:save`、`achievements:load-local`、`achievements:fetch-api`。设置 settingsStore 文件路径。 |
| `electron/preload.cts` | 暴露 `loadSettings`、`saveSettings`、`loadLocalAchievements`、`fetchApiAchievements`。 |
| `src/env.d.ts` | 补类型。 |
| `src/shared/achievements.ts` | 新建。渲染/主进程共享的成就类型定义。 |
| `src/components/GameDetail.vue` | 新建。详情视图。props: `appId`、`appName`、`images`、`settings`；emits: `back`、`toggle-selected`。 |
| `src/components/SettingsDialog.vue` | 新建。设置弹窗。props: `settings`；emits: `save`、`close`。 |
| `src/App.vue` | 加齿轮按钮、`activeView` 切换、详情按钮、成就区。 |

---

### Task 1: 共享类型 + settingsStore + 单测

**Files:**
- Create: `src/shared/achievements.ts`
- Create: `electron/settingsStore.ts`
- Test: `electron/settingsStore.test.ts`

**Interfaces:**
- Produces: `SteamSettings`（in `src/shared/achievements.ts`）；`loadSettings(): Promise<SteamSettings>`、`saveSettings(settings: SteamSettings): Promise<void>`、`setSettingsFilePath(path: string): void`（in `electron/settingsStore.ts`）。

- [ ] **Step 1: Create shared types file**

Create `src/shared/achievements.ts`:

```ts
export interface Achievement {
  apiName: string
  name: string
  description: string
  achieved: boolean
  iconUrl: string
}

export interface SteamSettings {
  apiKey: string
  steamId: string
}
```

- [ ] **Step 2: Write the failing test**

Create `electron/settingsStore.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSettings, saveSettings, setSettingsFilePath } from './settingsStore'

describe('settingsStore', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'settings-'))
    setSettingsFilePath(join(dir, 'settings.json'))
  })

  it('returns empty settings when file does not exist', async () => {
    expect(await loadSettings()).toEqual({ apiKey: '', steamId: '' })
  })

  it('saves and reloads settings', async () => {
    await saveSettings({ apiKey: 'key123', steamId: '7654' })
    expect(await loadSettings()).toEqual({ apiKey: 'key123', steamId: '7654' })
  })

  it('ignores invalid json gracefully', async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(dir, 'settings.json'), 'not json', 'utf-8')
    expect(await loadSettings()).toEqual({ apiKey: '', steamId: '' })
  })

  it('validates shape on load', async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ apiKey: 'x' }), 'utf-8')
    expect(await loadSettings()).toEqual({ apiKey: '', steamId: '' })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run electron/settingsStore.test.ts`
Expected: FAIL with "Cannot find module './settingsStore'".

- [ ] **Step 4: Write minimal implementation**

Create `electron/settingsStore.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SteamSettings } from '../src/shared/achievements.js'

export type { SteamSettings }

let settingsFilePath = join(process.cwd(), 'settings.json')

export function setSettingsFilePath(filePath: string): void {
  settingsFilePath = filePath
}

export async function loadSettings(): Promise<SteamSettings> {
  try {
    const raw = await readFile(settingsFilePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (isValidSettings(parsed)) {
      return parsed
    }
    return { apiKey: '', steamId: '' }
  } catch {
    return { apiKey: '', steamId: '' }
  }
}

export async function saveSettings(settings: SteamSettings): Promise<void> {
  await writeFile(settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8')
}

function isValidSettings(value: unknown): value is SteamSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const v = value as Record<string, unknown>
  return typeof v.apiKey === 'string' && typeof v.steamId === 'string'
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run electron/settingsStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/shared/achievements.ts electron/settingsStore.ts electron/settingsStore.test.ts
git commit -m "feat: 共享类型 + settingsStore 读写 Web API 配置"
```

---

### Task 2: achievementStore 本地解析 + 单测

**Files:**
- Create: `electron/achievementStore.ts`
- Test: `electron/achievementStore.test.ts`

**Interfaces:**
- Consumes: `Achievement` from `src/shared/achievements`（Task 1）。
- Produces: `parseUserGameStats(json: unknown): Achievement[]`、`loadLocalAchievements(userdataDir: string, appId: string): Promise<Achievement[]>`、`fetchApiAchievements(appId: string, apiKey: string, steamId: string): Promise<Achievement[]>`。

本地 `UserGameStats_<appid>.json` 结构：
```json
{
  "achievements": {
    "ACH_WIN_100": { "earned": true, "earned_time": 1638000000 },
    "ACH_FIRST_KILL": { "earned": false, "earned_time": 0 }
  }
}
```
本地文件无 name/description/iconUrl → name 用 apiName，description 空，iconUrl 空。

- [ ] **Step 1: Write the failing test**

Create `electron/achievementStore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseUserGameStats } from './achievementStore'

describe('parseUserGameStats', () => {
  it('extracts achievements with earned status', () => {
    const json = {
      achievements: {
        ACH_WIN_100: { earned: true, earned_time: 1638000000 },
        ACH_FIRST_KILL: { earned: false, earned_time: 0 },
      },
    }
    const result = parseUserGameStats(json)
    expect(result).toEqual([
      { apiName: 'ACH_WIN_100', name: 'ACH_WIN_100', description: '', achieved: true, iconUrl: '' },
      { apiName: 'ACH_FIRST_KILL', name: 'ACH_FIRST_KILL', description: '', achieved: false, iconUrl: '' },
    ])
  })

  it('returns empty array when achievements missing', () => {
    expect(parseUserGameStats({})).toEqual([])
  })

  it('returns empty array for invalid input', () => {
    expect(parseUserGameStats(null)).toEqual([])
    expect(parseUserGameStats('not an object')).toEqual([])
  })

  it('skips malformed achievement entries', () => {
    const json = {
      achievements: {
        ACH_GOOD: { earned: true },
        ACH_BAD: { earned: 'yes' }, // earned 不是 boolean
      },
    }
    const result = parseUserGameStats(json)
    expect(result).toHaveLength(1)
    expect(result[0].apiName).toBe('ACH_GOOD')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/achievementStore.test.ts`
Expected: FAIL with "Cannot find module './achievementStore'".

- [ ] **Step 3: Write minimal implementation**

Create `electron/achievementStore.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Achievement } from '../src/shared/achievements.js'

export type { Achievement }

// 解析本地 UserGameStats_<appid>.json
export function parseUserGameStats(json: unknown): Achievement[] {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return []
  }
  const achievements = (json as { achievements?: unknown }).achievements
  if (typeof achievements !== 'object' || achievements === null || Array.isArray(achievements)) {
    return []
  }
  const result: Achievement[] = []
  for (const [apiName, entry] of Object.entries(achievements as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) continue
    const earned = (entry as { earned?: unknown }).earned
    if (typeof earned !== 'boolean') continue
    result.push({
      apiName,
      name: apiName, // 本地文件无人类可读名称
      description: '',
      achieved: earned,
      iconUrl: '', // 本地文件无图标
    })
  }
  return result
}

// 遍历 userdata 下所有账号，找 UserGameStats_<appid>.json
export async function loadLocalAchievements(userdataDir: string, appId: string): Promise<Achievement[]> {
  let accounts: string[]
  try {
    accounts = await readdir(userdataDir)
  } catch {
    return []
  }

  for (const account of accounts) {
    const file = join(userdataDir, account, 'stats', `UserGameStats_${appId}.json`)
    try {
      const raw = await readFile(file, 'utf-8')
      const parsed = JSON.parse(raw)
      const achievements = parseUserGameStats(parsed)
      if (achievements.length > 0) {
        return achievements
      }
    } catch {
      // 该账号无此游戏数据，继续
    }
  }
  return []
}

// 调 Steam Web API 拉成就（含名称、描述、图标）
export async function fetchApiAchievements(
  appId: string,
  apiKey: string,
  steamId: string,
): Promise<Achievement[]> {
  const url = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}&appid=${encodeURIComponent(appId)}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Steam API 返回 ${response.status}`)
  }
  const data = await response.json()
  return parseApiAchievements(data, appId)
}

// 解析 Web API 返回结构
interface ApiAchievement {
  apiname: string
  name: string
  description: string
  achieved: number
  icon: string
}

function parseApiAchievements(data: unknown, appId: string): Achievement[] {
  const playerStats = (data as { playerstats?: { achievements?: ApiAchievement[]; error?: string } })?.playerstats
  if (!playerStats || !Array.isArray(playerStats.achievements)) {
    return []
  }
  return playerStats.achievements.map((a) => ({
    apiName: a.apiname,
    name: a.name || a.apiname,
    description: a.description || '',
    achieved: a.achieved === 1,
    iconUrl: a.icon
      ? `http://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/${appId}/${a.icon}`
      : '',
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/achievementStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/achievementStore.ts electron/achievementStore.test.ts
git commit -m "feat: achievementStore 本地解析 + Web API 拉取"
```

---

### Task 3: IPC handlers + preload 暴露

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.cts`
- Modify: `src/env.d.ts`

**Interfaces:**
- Consumes: `loadSettings`/`saveSettings`/`setSettingsFilePath` from settingsStore；`loadLocalAchievements`/`fetchApiAchievements` from achievementStore。
- Produces: `window.imageLibrary.loadSettings(): Promise<SteamSettings>`、`saveSettings(s): Promise<void>`、`loadLocalAchievements(appId): Promise<Achievement[]>`、`fetchApiAchievements(appId): Promise<Achievement[]>`（fetchApiAchievements 内部从 settings 读 key/steamId）。

- [ ] **Step 1: Wire settingsStore file path in main.ts**

In `electron/main.ts`, after the `setCollectionsFilePath(...)` line (around line 17), add:

```ts
import { setSettingsFilePath } from './settingsStore.js'
```

(add to existing imports near top)

Then after `setCollectionsFilePath(join(collectionsDirectory, 'collections.json'))` add:

```ts
setSettingsFilePath(join(collectionsDirectory, 'settings.json'))
```

- [ ] **Step 2: Add IPC handlers in main.ts**

The achievements:load-local handler needs the Steam root to derive `userdata`. Since the existing `loadSteamCollections` derives it from the librarycache dir passed at call time, but achievements IPC doesn't receive it, we capture the last-scanned directoryPath globally.

Add at top of `electron/main.ts` (after the existing `let`/const declarations, near line 12):

```ts
let lastLibrarycacheDir = ''
```

In the `image-library:scan-images` handler, capture it:

```ts
ipcMain.handle('image-library:scan-images', (_event, directoryPath: string, options: { includeDlc?: boolean }) => {
  lastLibrarycacheDir = directoryPath
  return scanImages(directoryPath, options ?? {})
})
```

Then after the `collage:save` handler (before `app.whenReady()`), add the settings + achievements handlers:

```ts
ipcMain.handle('settings:load', () => {
  return loadSettings()
})

ipcMain.handle('settings:save', (_event, settings: SteamSettings) => {
  return saveSettings(settings)
})

ipcMain.handle('achievements:load-local', async (_event, appId: string) => {
  if (!lastLibrarycacheDir) return []
  const steamRoot = dirname(dirname(lastLibrarycacheDir))
  const userdataDir = join(steamRoot, 'userdata')
  return loadLocalAchievements(userdataDir, appId)
})

ipcMain.handle('achievements:fetch-api', async (_event, appId: string) => {
  const settings = await loadSettings()
  if (!settings.apiKey || !settings.steamId) {
    throw new Error('未配置 Web API')
  }
  return fetchApiAchievements(appId, settings.apiKey, settings.steamId)
})
```

Add imports to top of main.ts (with the existing electron/ imports):

```ts
import { loadSettings, saveSettings } from './settingsStore.js'
import type { SteamSettings } from '../src/shared/achievements.js'
import { loadLocalAchievements, fetchApiAchievements } from './achievementStore.js'
```

- [ ] **Step 3: Expose in preload.cts**

In `electron/preload.cts`, add inside the `imageLibrary` object (after `saveCollage`):

```ts
  loadSettings(): Promise<{ apiKey: string; steamId: string }> {
    return ipcRenderer.invoke('settings:load')
  },
  saveSettings(settings: { apiKey: string; steamId: string }): Promise<void> {
    return ipcRenderer.invoke('settings:save', settings)
  },
  loadLocalAchievements(appId: string): Promise<unknown[]> {
    return ipcRenderer.invoke('achievements:load-local', appId)
  },
  fetchApiAchievements(appId: string): Promise<unknown[]> {
    return ipcRenderer.invoke('achievements:fetch-api', appId)
  },
```

- [ ] **Step 4: Add types in env.d.ts**

In `src/env.d.ts`, add to the `imageLibrary` interface (after `saveCollage`):

```ts
      loadSettings(): Promise<SteamSettings>
      saveSettings(settings: SteamSettings): Promise<void>
      loadLocalAchievements(appId: string): Promise<Achievement[]>
      fetchApiAchievements(appId: string): Promise<Achievement[]>
```

And add import at top of env.d.ts (after existing imports):

```ts
import type { Achievement, SteamSettings } from './shared/achievements'
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts electron/preload.cts src/env.d.ts
git commit -m "feat: settings + achievements IPC 与 preload 暴露"
```

---

### Task 4: SettingsDialog.vue 设置弹窗

**Files:**
- Create: `src/components/SettingsDialog.vue`

**Interfaces:**
- Consumes: `window.imageLibrary.loadSettings`/`saveSettings`。
- Produces: Vue 组件 `SettingsDialog`，props `{ }`（无），emits `{ close: [] }`。内部自加载/保存设置。

- [ ] **Step 1: Create component**

Create `src/components/SettingsDialog.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { SteamSettings } from '../shared/achievements'

const emit = defineEmits<{ close: [] }>()

const apiKey = ref('')
const steamId = ref('')
const isSaving = ref(false)
const errorMessage = ref('')
const saved = ref(false)

onMounted(async () => {
  try {
    const s = await window.imageLibrary.loadSettings()
    apiKey.value = s.apiKey
    steamId.value = s.steamId
  } catch {
    errorMessage.value = '加载设置失败'
  }
})

async function save(): Promise<void> {
  isSaving.value = true
  errorMessage.value = ''
  saved.value = false
  try {
    await window.imageLibrary.saveSettings({ apiKey: apiKey.value.trim(), steamId: steamId.value.trim() })
    saved.value = true
  } catch {
    errorMessage.value = '保存失败'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="settings-backdrop" @click.self="emit('close')">
    <div class="settings-dialog">
      <h3>设置</h3>
      <p>配置 Steam Web API 以获取成就图标和名称</p>

      <div class="settings-field">
        <label>Steam Web API Key</label>
        <input v-model="apiKey" type="text" class="settings-input" placeholder="在 steamcommunity.com/dev 申请" autocomplete="off" />
      </div>

      <div class="settings-field">
        <label>Steam ID（17 位数字）</label>
        <input v-model="steamId" type="text" class="settings-input" placeholder="76561198..." autocomplete="off" />
      </div>

      <p class="settings-hint">
        未配置时，成就仅显示本地文件中的解锁状态（无图标/名称）。
      </p>

      <p v-if="errorMessage" class="settings-error">{{ errorMessage }}</p>
      <p v-if="saved" class="settings-saved">已保存</p>

      <div class="settings-actions">
        <button class="ghost-button" type="button" @click="emit('close')">关闭</button>
        <button class="primary-button" type="button" :disabled="isSaving" @click="save">
          {{ isSaving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2, 6, 23, 0.66);
}
.settings-dialog {
  width: 460px;
  max-width: 92vw;
  padding: 24px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 18px;
  background: #172033;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}
.settings-dialog h3 { margin: 0 0 8px; }
.settings-dialog p { margin: 0 0 16px; color: #94a3b8; font-size: 14px; }
.settings-field { margin-bottom: 16px; }
.settings-field label { display: block; margin-bottom: 6px; color: #94a3b8; font-size: 13px; }
.settings-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  font-size: 14px;
  box-sizing: border-box;
}
.settings-hint { font-size: 12px; color: #64748b; }
.settings-error { color: #fca5a5; margin: 0 0 12px; }
.settings-saved { color: #86efac; margin: 0 0 12px; }
.settings-actions { display: flex; justify-content: flex-end; gap: 10px; }
</style>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/SettingsDialog.vue
git commit -m "feat: SettingsDialog 设置弹窗"
```

---

### Task 5: GameDetail.vue 详情视图

**Files:**
- Create: `src/components/GameDetail.vue`

**Interfaces:**
- Consumes: `window.imageLibrary.loadLocalAchievements`、`fetchApiAchievements`、`loadSettings`；`ImageAsset` from `src/shared/imageLibrary`；`Achievement`、`SteamSettings` from `src/shared/achievements`。
- Produces: Vue 组件 `GameDetail`，props `{ appId: string; appName: string; images: ImageAsset[]; selectedPaths: Set<string> }`，emits `{ back: []; 'toggle-selected': [path: string] }`。

**成就加载逻辑：**
1. 点「加载成就」按钮。
2. 先尝试 `fetchApiAchievements`（若已配置 API）。成功 → 显示富网格（图标+名称+描述+解锁状态）。
3. 若 API 未配置或失败 → 调 `loadLocalAchievements`。有结果 → 显示有限视图（apiName + ✓/✗），提示「配置 Web API 可显示图标」。
4. 本地也无 → 显示「需要配置 Web API 获取成就」。

- [ ] **Step 1: Create component**

Create `src/components/GameDetail.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { ImageAsset } from '../shared/imageLibrary'
import type { Achievement } from '../shared/achievements'

const props = defineProps<{
  appId: string
  appName: string
  images: ImageAsset[]
  selectedPaths: Set<string>
}>()
const emit = defineEmits<{ back: []; 'toggle-selected': [path: string] }>()

const achievements = ref<Achievement[]>([])
const achievementsSource = ref<'none' | 'local' | 'api'>('none')
const isLoadingAchievements = ref(false)
const achievementError = ref('')
const hasApiConfig = ref(false)

async function loadAchievements(): Promise<void> {
  if (isLoadingAchievements.value) return
  isLoadingAchievements.value = true
  achievementError.value = ''
  try {
    // 先检查 API 配置
    const settings = await window.imageLibrary.loadSettings()
    hasApiConfig.value = !!settings.apiKey && !!settings.steamId

    if (hasApiConfig.value) {
      try {
        achievements.value = await window.imageLibrary.fetchApiAchievements(props.appId)
        achievementsSource.value = 'api'
        if (achievements.value.length === 0) {
          achievementError.value = '该游戏没有成就，或未公开成就'
        }
        return
      } catch (err) {
        console.error('[achievements] API 失败，回退本地:', err)
      }
    }

    // 回退本地
    achievements.value = await window.imageLibrary.loadLocalAchievements(props.appId)
    if (achievements.value.length > 0) {
      achievementsSource.value = 'local'
    } else {
      achievementError.value = hasApiConfig.value
        ? '未找到成就数据（本地无记录，API 也未返回）'
        : '需要配置 Web API 获取成就（点右上角齿轮）'
    }
  } catch (err) {
    console.error('[achievements] 加载失败:', err)
    achievementError.value = '加载成就失败'
  } finally {
    isLoadingAchievements.value = false
  }
}

function isSelected(path: string): boolean {
  return props.selectedPaths.has(path)
}
</script>

<template>
  <div class="game-detail">
    <div class="detail-header">
      <button class="ghost-button" type="button" @click="emit('back')">← 返回</button>
      <h2>{{ appName }}</h2>
      <span class="detail-appid">{{ appId }} · {{ images.length }} 张图片</span>
    </div>

    <h3 class="section-title">图片</h3>
    <div class="image-grid">
      <article
        v-for="image in images"
        :key="image.absolutePath"
        class="image-card"
        :class="{ 'selected-card': isSelected(image.absolutePath) }"
      >
        <label class="select-checkbox" @click.stop>
          <input
            type="checkbox"
            :checked="isSelected(image.absolutePath)"
            @change="emit('toggle-selected', image.absolutePath)"
          />
        </label>
        <div class="preview-frame" @click="emit('toggle-selected', image.absolutePath)">
          <img :src="image.fileUrl" :alt="image.name" loading="lazy" />
        </div>
        <div class="image-meta">
          <strong :title="image.name">{{ image.name }}</strong>
        </div>
      </article>
    </div>

    <h3 class="section-title">成就</h3>
    <div class="achievements-section">
      <button
        v-if="achievementsSource === 'none'"
        class="secondary-button"
        type="button"
        :disabled="isLoadingAchievements"
        @click="loadAchievements"
      >
        {{ isLoadingAchievements ? '加载中…' : '加载成就' }}
      </button>

      <p v-if="achievementError" class="achievement-error">{{ achievementError }}</p>

      <p v-if="achievementsSource === 'local'" class="achievement-hint">
        仅显示本地解锁状态。配置 Web API（齿轮按钮）可显示图标和名称。
      </p>

      <div v-if="achievements.length > 0" class="achievement-grid">
        <div
          v-for="a in achievements"
          :key="a.apiName"
          class="achievement-card"
          :class="{ 'achievement-locked': !a.achieved }"
        >
          <img v-if="a.iconUrl" :src="a.iconUrl" :alt="a.name" loading="lazy" />
          <div v-else class="achievement-icon-placeholder">{{ a.achieved ? '✓' : '✗' }}</div>
          <div class="achievement-info">
            <strong>{{ a.name }}</strong>
            <span class="achievement-desc">{{ a.description }}</span>
            <span class="achievement-status">{{ a.achieved ? '已解锁' : '未解锁' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-detail { padding: 0; }
.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
.detail-header h2 { margin: 0; flex: 1; }
.detail-appid { color: #94a3b8; font-size: 13px; }
.section-title { margin: 24px 0 12px; color: #cbd5e1; }
.achievements-section { min-height: 80px; }
.achievement-error { color: #fca5a5; }
.achievement-hint { color: #fbbf24; font-size: 13px; margin: 12px 0; }
.achievement-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.achievement-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.6);
}
.achievement-card.achievement-locked { opacity: 0.5; }
.achievement-card img {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  flex: 0 0 auto;
}
.achievement-icon-placeholder {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: #94a3b8;
  flex: 0 0 auto;
}
.achievement-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.achievement-info strong { font-size: 14px; }
.achievement-desc { color: #94a3b8; font-size: 12px; }
.achievement-status { color: #64748b; font-size: 11px; margin-top: 4px; }
</style>
```

Note: the `.image-grid`, `.image-card`, `.preview-frame`, `.image-meta`, `.selected-card`, `.select-checkbox` classes are defined in App.vue's `<style scoped>` — but scoped styles don't cross components. So this component must define its own image-grid styles. Add this to the `<style scoped>` block above (after `.section-title`):

```css
.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 18px;
}
.image-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.74);
}
.image-card.selected-card {
  border-color: #7dd3fc;
  box-shadow: 0 0 0 2px rgba(125, 211, 252, 0.4);
}
.preview-frame { cursor: pointer; }
.preview-frame img { width: 100%; display: block; }
.image-meta { padding: 8px 12px; }
.image-meta strong { display: block; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.select-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  background: rgba(15, 23, 42, 0.8);
  padding: 4px;
  border-radius: 6px;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/GameDetail.vue
git commit -m "feat: GameDetail 详情视图组件"
```

---

### Task 6: App.vue 接入齿轮按钮 + 详情切换 + 卡片详情按钮

**Files:**
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `GameDetail` from `src/components/GameDetail.vue`；`SettingsDialog` from `src/components/SettingsDialog.vue`。

- [ ] **Step 1: Add imports and state**

In `src/App.vue` `<script setup>`, after the `CollageDialog` import, add:

```ts
import GameDetail from './components/GameDetail.vue'
import SettingsDialog from './components/SettingsDialog.vue'
```

After the `isCollageDialogOpen` ref, add:

```ts
const isSettingsOpen = ref(false)
const detailAppId = ref<string | null>(null)
const detailAppName = ref('')
```

- [ ] **Step 2: Add computed for detail images + open handler**

After the `openCollageDialog` function, add:

```ts
const detailImages = computed(() => {
  if (detailAppId.value === null) return []
  return images.value.filter((image) => image.appId === detailAppId.value)
})

function openGameDetail(appId: string, appName: string): void {
  detailAppId.value = appId
  detailAppName.value = appName
}

function closeGameDetail(): void {
  detailAppId.value = null
  detailAppName.value = ''
}
```

- [ ] **Step 3: Add detail button to image card**

In the image card template (the `<article>` with class `image-card`), add a detail button. Find the `<div class="image-meta">` block (around line 673-686) and add a detail button before the remove button. Change:

```vue
            <div class="image-meta">
              <strong :title="image.appName || image.relativePath">
                {{ image.appName || image.relativePath }}
              </strong>
              <span class="meta-sub">{{ image.appId }} · {{ formatFileSize(image.sizeBytes) }}</span>
              <button
                v-if="activeCollection !== '全部'"
                class="ghost-button remove-button"
                type="button"
                @click="removeFromCollection(image.absolutePath, activeCollection)"
              >
                从「{{ activeCollection }}」移除
              </button>
            </div>
```

to:

```vue
            <div class="image-meta">
              <strong :title="image.appName || image.relativePath">
                {{ image.appName || image.relativePath }}
              </strong>
              <span class="meta-sub">{{ image.appId }} · {{ formatFileSize(image.sizeBytes) }}</span>
              <div class="meta-actions">
                <button
                  class="ghost-button detail-button"
                  type="button"
                  title="查看游戏详情与成就"
                  @click.stop="openGameDetail(image.appId, image.appName || image.relativePath)"
                >
                  详情
                </button>
                <button
                  v-if="activeCollection !== '全部'"
                  class="ghost-button remove-button"
                  type="button"
                  @click="removeFromCollection(image.absolutePath, activeCollection)"
                >
                  从「{{ activeCollection }}」移除
                </button>
              </div>
            </div>
```

- [ ] **Step 4: Add settings gear button + detail view + settings dialog**

Find the top toolbar area. The main content section starts with `<section class="main-content">`. The header/toolbar is above the image grid. Add a gear button in the selection bar area or top bar. After the `<CollageDialog>` block (end of template, before closing `</template>` root), add:

```vue
    <SettingsDialog v-if="isSettingsOpen" @close="isSettingsOpen = false" />
```

For the gear button: find the collection-bar or top area. Add a gear button. Locate the `<div class="collection-bar" role="tablist" aria-label="按文件名筛选">` and add before the first `.collection-bar`:

```vue
        <div class="top-bar">
          <span class="collection-label">工具：</span>
          <button class="ghost-button" type="button" title="设置" @click="isSettingsOpen = true">
            ⚙ 设置
          </button>
        </div>
```

Then wrap the existing main image grid section in a conditional. Find `<div v-else class="image-grid">` (the main grid) — actually, the cleaner approach: add a top-level view switch. After the opening `<section class="main-content">` (or wherever the main content begins), add at the very top of main content:

```vue
      <GameDetail
        v-if="detailAppId !== null"
        :app-id="detailAppId"
        :app-name="detailAppName"
        :images="detailImages"
        :selected-paths="selectedPaths"
        @back="closeGameDetail"
        @toggle-selected="toggleSelected"
      />
      <template v-else>
```

And before the closing `</section>` of main-content, add:

```vue
      </template>
```

This wraps the entire existing main content (collection bars, image grid, etc.) in the `v-else` so it only shows when not in detail view.

- [ ] **Step 5: Add CSS for detail button and top-bar**

In App.vue's `<style scoped>`, add:

```css
.meta-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.detail-button {
  padding: 2px 8px;
  font-size: 12px;
}
.top-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
```

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/App.vue
git commit -m "feat: 齿轮设置按钮 + 游戏详情视图切换"
```

---

### Task 7: 验证

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: settings + achievements + collage + all non-scanner tests pass. Pre-existing scanner failures (3, Windows file-ordering) remain — not regressions.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Run `npm run dev:electron`. Then:
1. 扫描图片 → 看到图片网格，每张卡片下方有「详情」按钮。
2. 点「详情」→ 切换到该游戏详情视图，顶栏有返回按钮。
3. 上半部分显示该游戏所有图片，可选中/下载/拼图。
4. 点「加载成就」→ 未配置 API 时显示「需要配置 Web API 获取成就」。
5. 点右上角齿轮 → 设置弹窗，填入 API key + steamid → 保存 → 关闭。
6. 回详情页点「加载成就」→ 应调 API 显示成就网格（图标+名称+解锁状态）。
7. 点返回 → 回到全量列表。
8. 验证详情页图片选中状态与主界面一致（共享 selectedPaths）。

Expected: 全部正常，无控制台报错。
