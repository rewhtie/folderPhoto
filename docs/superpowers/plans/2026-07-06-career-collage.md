# 职业游戏生涯拼图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「职业游戏生涯拼图」tab 页，调 Steam API 获取所有游戏时长，按个人库分位分档展示封面，支持横/竖切换与 PNG 导出。

**Architecture:** 新增 `ownedGamesStore.ts`（API+缓存）走现有 store 范式；分档逻辑做成纯函数 `tierGames`（TDD）；`CareerCollage.vue` 承载页面；`App.vue` 加 tab 栏条件渲染；导出用手动 Canvas 绘制复用 `collage:save` IPC。

**Tech Stack:** Electron 42, Vue 3, TypeScript, vitest, Steam Web API (`IPlayerService/GetOwnedGames/v1/`)

## Global Constraints

- 数据目录：portable 版 `PORTABLE_EXECUTABLE_DIR`，安装版 `app.getPath('userData')`，开发项目根目录（复用现有 `collectionsDirectory`）
- 封面走 Steam CDN：横版 `https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/header.jpg`，竖版 `library_600x900.jpg`
- 缓存文件名 `owned-games.json`，范式同 `achievementStore.ts`
- 复用现有 `collage:save` IPC 导出，不引入新依赖
- 时长单位：API 返回分钟，显示按小时

---

### Task 1: ownedGames 共享类型 + store 模块

**Files:**
- Create: `src/shared/ownedGames.ts`
- Create: `electron/ownedGamesStore.ts`
- Create: `electron/ownedGamesStore.test.ts`

**Interfaces:**
- Produces: `OwnedGame`（`{ appid: number; name: string; playtimeForever: number }`）、`OwnedGamesResult`（`{ games: OwnedGame[]; error?: string }`）、`fetchOwnedGames(apiKey, steamId)`、`loadCachedOwnedGames()`、`saveOwnedGamesCache(games)`、`setOwnedGamesCacheBaseDir(dir)`、`parseOwnedGamesResponse(data)`

- [ ] **Step 1: 创建共享类型文件**

`src/shared/ownedGames.ts`:

```typescript
export interface OwnedGame {
  appid: number
  name: string
  playtimeForever: number // 分钟
}

export interface OwnedGamesResult {
  games: OwnedGame[]
  error?: string
}
```

- [ ] **Step 2: 写失败测试**

`electron/ownedGamesStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  setOwnedGamesCacheBaseDir,
  loadCachedOwnedGames,
  saveOwnedGamesCache,
  parseOwnedGamesResponse,
} from './ownedGamesStore.js'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'owned-games-test-'))
  setOwnedGamesCacheBaseDir(tempDir)
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('parseOwnedGamesResponse', () => {
  it('extracts games from Steam API response', () => {
    const data = {
      response: {
        game_count: 2,
        games: [
          { appid: 730, name: 'CS2', playtime_forever: 600, img_icon_url: 'abc' },
          { appid: 440, name: 'TF2', playtime_forever: 120 },
        ],
      },
    }
    const result = parseOwnedGamesResponse(data)
    expect(result).toEqual([
      { appid: 730, name: 'CS2', playtimeForever: 600 },
      { appid: 440, name: 'TF2', playtimeForever: 120 },
    ])
  })

  it('returns empty when response.games is missing', () => {
    expect(parseOwnedGamesResponse({ response: {} })).toEqual([])
    expect(parseOwnedGamesResponse({})).toEqual([])
    expect(parseOwnedGamesResponse(null)).toEqual([])
  })

  it('defaults missing playtime to 0 and name to empty', () => {
    const data = { response: { games: [{ appid: 1 }] } }
    expect(parseOwnedGamesResponse(data)).toEqual([{ appid: 1, name: '', playtimeForever: 0 }])
  })
})

describe('owned games cache', () => {
  it('returns null when no cache exists', async () => {
    expect(await loadCachedOwnedGames()).toBeNull()
  })

  it('save + load round-trips', async () => {
    const games = [
      { appid: 730, name: 'CS2', playtimeForever: 600 },
      { appid: 440, name: 'TF2', playtimeForever: 120 },
    ]
    await saveOwnedGamesCache(games)
    expect(await loadCachedOwnedGames()).toEqual(games)
  })

  it('returns null on corrupt JSON', async () => {
    await writeFile(join(tempDir, 'owned-games.json'), 'not json!!!')
    expect(await loadCachedOwnedGames()).toBeNull()
  })

  it('returns null on invalid shape', async () => {
    await writeFile(join(tempDir, 'owned-games.json'), JSON.stringify([{ appid: 'not a number' }]))
    expect(await loadCachedOwnedGames()).toBeNull()
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run electron/ownedGamesStore.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现 store**

`electron/ownedGamesStore.ts`:

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { OwnedGame } from '../src/shared/ownedGames.js'

let cacheBaseDir = ''

export function setOwnedGamesCacheBaseDir(dir: string): void {
  cacheBaseDir = dir
}

const CACHE_FILENAME = 'owned-games.json'

export async function loadCachedOwnedGames(): Promise<OwnedGame[] | null> {
  if (!cacheBaseDir) return null
  const filePath = join(cacheBaseDir, CACHE_FILENAME)
  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return isValidOwnedGames(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function saveOwnedGamesCache(games: OwnedGame[]): Promise<void> {
  if (!cacheBaseDir) return
  await mkdir(cacheBaseDir, { recursive: true })
  const filePath = join(cacheBaseDir, CACHE_FILENAME)
  await writeFile(filePath, JSON.stringify(games, null, 2), 'utf-8')
}

function isValidOwnedGames(value: unknown): value is OwnedGame[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (g) =>
      typeof g === 'object' &&
      g !== null &&
      typeof (g as OwnedGame).appid === 'number' &&
      typeof (g as OwnedGame).name === 'string' &&
      typeof (g as OwnedGame).playtimeForever === 'number',
  )
}

interface RawOwnedGame {
  appid: number
  name?: string
  playtime_forever?: number
  img_icon_url?: string
}

// 纯函数：解析 Steam API 响应，便于测试
export function parseOwnedGamesResponse(data: unknown): OwnedGame[] {
  if (typeof data !== 'object' || data === null) return []
  const resp = data as { response?: { games?: RawOwnedGame[] } }
  const games = resp.response?.games
  if (!Array.isArray(games)) return []
  return games.map((g) => ({
    appid: g.appid,
    name: g.name ?? '',
    playtimeForever: g.playtime_forever ?? 0,
  }))
}

// 调 Steam Web API：IPlayerService/GetOwnedGames/v1/
export async function fetchOwnedGames(apiKey: string, steamId: string): Promise<OwnedGame[]> {
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}&include_appinfo=true&include_played_free_games=true&format=json`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Steam API 请求失败：HTTP ${response.status}`)
  }
  const data = await response.json()
  return parseOwnedGamesResponse(data)
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run electron/ownedGamesStore.test.ts`
Expected: PASS（7 个测试全过）

- [ ] **Step 6: Commit**

```bash
git add src/shared/ownedGames.ts electron/ownedGamesStore.ts electron/ownedGamesStore.test.ts
git commit -m "feat: add ownedGames store with Steam API + cache"
```

---

### Task 2: 分档纯函数

**Files:**
- Create: `src/shared/careerCollage.ts`
- Create: `src/shared/careerCollage.test.ts`

**Interfaces:**
- Consumes: `OwnedGame`（来自 Task 1）
- Produces: `Tier`（`'xl' | 'l' | 'm' | 's'`）、`Orientation`（`'landscape' | 'portrait'`）、`TieredGames`（`{ xl, l, m, s: OwnedGame[] }`）、`tierGames(games: OwnedGame[]): TieredGames`

- [ ] **Step 1: 写失败测试**

`src/shared/careerCollage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { tierGames } from './careerCollage'
import type { OwnedGame } from './ownedGames'

function game(appid: number, playtime: number): OwnedGame {
  return { appid, name: `g${appid}`, playtimeForever: playtime }
}

describe('tierGames', () => {
  it('returns all empty for zero games', () => {
    expect(tierGames([])).toEqual({ xl: [], l: [], m: [], s: [] })
  })

  it('filters out unplayed games (playtime 0)', () => {
    const result = tierGames([game(1, 0), game(2, 60), game(3, 0)])
    const total = result.xl.length + result.l.length + result.m.length + result.s.length
    expect(total).toBe(1)
  })

  it('n < 4: puts all in xl (uniform)', () => {
    const result = tierGames([game(1, 300), game(2, 200), game(3, 100)])
    expect(result.xl).toHaveLength(3)
    expect(result.l).toEqual([])
    expect(result.m).toEqual([])
    expect(result.s).toEqual([])
  })

  it('n = 10: splits 1/2/3/4', () => {
    const games = Array.from({ length: 10 }, (_, i) => game(i + 1, 1000 - i * 10))
    const result = tierGames(games)
    expect(result.xl).toHaveLength(1)
    expect(result.l).toHaveLength(2)
    expect(result.m).toHaveLength(3)
    expect(result.s).toHaveLength(4)
  })

  it('n = 100: splits 10/20/30/40', () => {
    const games = Array.from({ length: 100 }, (_, i) => game(i + 1, 10000 - i))
    const result = tierGames(games)
    expect(result.xl).toHaveLength(10)
    expect(result.l).toHaveLength(20)
    expect(result.m).toHaveLength(30)
    expect(result.s).toHaveLength(40)
  })

  it('sorts by playtime descending within all tiers', () => {
    const games = Array.from({ length: 10 }, (_, i) => game(i + 1, 1000 - i * 10))
    const result = tierGames(games)
    expect(result.xl[0].appid).toBe(1)   // 1000 min, index 0
    expect(result.l[0].appid).toBe(2)    // 990 min, index 1
    expect(result.m[0].appid).toBe(4)    // 970 min, index 3
    expect(result.s[0].appid).toBe(7)    // 940 min, index 6
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/shared/careerCollage.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现分档函数**

`src/shared/careerCollage.ts`:

```typescript
import type { OwnedGame } from './ownedGames'

export type Tier = 'xl' | 'l' | 'm' | 's'
export type Orientation = 'landscape' | 'portrait'

export interface TieredGames {
  xl: OwnedGame[]
  l: OwnedGame[]
  m: OwnedGame[]
  s: OwnedGame[]
}

// 按个人库分位分档：XL 前 10%，L 10-30%，M 30-60%，S 60-100%
// 仅对 playtimeForever > 0 的游戏分档
export function tierGames(games: OwnedGame[]): TieredGames {
  const played = games
    .filter((g) => g.playtimeForever > 0)
    .sort((a, b) => b.playtimeForever - a.playtimeForever)

  const n = played.length
  const empty: TieredGames = { xl: [], l: [], m: [], s: [] }
  if (n === 0) return empty
  if (n < 4) return { ...empty, xl: played } // 退化：全部 XL，UI 统一大小

  const xlEnd = Math.max(1, Math.floor(n * 0.1))
  const lEnd = Math.max(xlEnd + 1, Math.floor(n * 0.3))
  const mEnd = Math.max(lEnd + 1, Math.floor(n * 0.6))

  return {
    xl: played.slice(0, xlEnd),
    l: played.slice(xlEnd, lEnd),
    m: played.slice(lEnd, mEnd),
    s: played.slice(mEnd),
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/shared/careerCollage.test.ts`
Expected: PASS（6 个测试全过）

- [ ] **Step 5: Commit**

```bash
git add src/shared/careerCollage.ts src/shared/careerCollage.test.ts
git commit -m "feat: add tierGames percentile tiering logic"
```

---

### Task 3: IPC handler + preload 暴露

**Files:**
- Modify: `electron/main.ts` — 新增 import + `setOwnedGamesCacheBaseDir` 调用 + `owned-games:fetch` handler
- Modify: `electron/preload.cts` — 新增 `fetchOwnedGames`

**Interfaces:**
- Consumes: `fetchOwnedGames`、`loadCachedOwnedGames`、`saveOwnedGamesCache`、`setOwnedGamesCacheBaseDir`（来自 Task 1）、`loadSettings`（已有）
- Produces: IPC `owned-games:fetch(force?: boolean) → OwnedGamesResult`、`window.imageLibrary.fetchOwnedGames(force?)`

- [ ] **Step 1: 更新 main.ts imports**

在 [electron/main.ts:9-15](electron/main.ts#L9-L15) 的 achievementStore import 块后新增 import。找到现有的：

```typescript
import {
  fetchApiAchievements,
  loadLocalAchievements,
  setAchievementCacheBaseDir,
  loadCachedAchievements,
  saveAchievementCache,
} from './achievementStore.js'
```

在其后添加：

```typescript
import {
  fetchOwnedGames,
  loadCachedOwnedGames,
  saveOwnedGamesCache,
  setOwnedGamesCacheBaseDir,
} from './ownedGamesStore.js'
```

- [ ] **Step 2: 注册缓存目录**

在 [electron/main.ts:31](electron/main.ts#L31) `setAchievementCacheBaseDir(collectionsDirectory)` 后添加一行：

```typescript
setOwnedGamesCacheBaseDir(collectionsDirectory)
```

- [ ] **Step 3: 新增 IPC handler**

在 [electron/main.ts](electron/main.ts) 的 `achievements:open-cache-dir` handler 之后、`app.whenReady().then(...)` 之前插入：

```typescript
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
    const games = await fetchOwnedGames(settings.apiKey, settings.steamId)
    await saveOwnedGamesCache(games)
    return { games }
  } catch (err) {
    return {
      games: [],
      error: err instanceof Error ? err.message : '请求失败',
    }
  }
})
```

- [ ] **Step 4: preload 暴露**

在 [electron/preload.cts:49](electron/preload.cts#L49) `openAchievementCacheDir` 之后、`})` 闭合之前添加：

```typescript
  fetchOwnedGames(force?: boolean): Promise<OwnedGamesResult> {
    return ipcRenderer.invoke('owned-games:fetch', force ?? false)
  },
```

并在文件顶部 import 区添加类型 import（与其他 type import 并列）：

```typescript
import type { OwnedGamesResult } from '../src/shared/ownedGames.js'
```

- [ ] **Step 5: typecheck 确认编译通过**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts electron/preload.cts
git commit -m "feat: wire owned-games:fetch IPC + preload exposure"
```

---

### Task 4: CareerCollage.vue 页面展示

**Files:**
- Create: `src/components/CareerCollage.vue`

**Interfaces:**
- Consumes: `window.imageLibrary.fetchOwnedGames(force?)`（Task 3）、`tierGames`、`Tier`、`Orientation`（Task 2）、`OwnedGame`（Task 1）
- Produces: `CareerCollage` 组件（导出按钮在 Task 6 接入）

- [ ] **Step 1: 创建组件（展示部分，不含导出）**

`src/components/CareerCollage.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { OwnedGame, OwnedGamesResult } from '../shared/ownedGames'
import { tierGames, type Tier, type Orientation, type TieredGames } from '../shared/careerCollage'

const games = ref<OwnedGame[]>([])
const loading = ref(false)
const errorMessage = ref('')
const orientation = ref<Orientation>('landscape')

const tiered = computed<TieredGames>(() => tierGames(games.value))

const tierOrder: Tier[] = ['xl', 'l', 'm', 's']
const tierLabels: Record<Tier, string> = {
  xl: 'XL · 前 10%',
  l: 'L · 10–30%',
  m: 'M · 30–60%',
  s: 'S · 60–100%',
}

// 每档封面宽度（px），按方向区分
const tierSizes: Record<Orientation, Record<Tier, number>> = {
  landscape: { xl: 220, l: 160, m: 120, s: 80 },
  portrait: { xl: 130, l: 95, m: 70, s: 48 },
}

function coverUrl(appid: number): string {
  return orientation.value === 'landscape'
    ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
    : `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`
}

function coverWidth(tier: Tier): number {
  return tierSizes[orientation.value][tier]
}

function coverHeight(tier: Tier): number {
  const w = coverWidth(tier)
  return orientation.value === 'landscape' ? (w * 215) / 460 : (w * 900) / 600
}

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  if (hours < 100) return `${hours.toFixed(1)}h`
  return `${Math.round(hours)}h`
}

const totalHours = computed(() => {
  const mins = games.value.reduce((sum, g) => sum + g.playtimeForever, 0)
  return Math.round(mins / 60)
})

const playedCount = computed(() => games.value.filter((g) => g.playtimeForever > 0).length)

async function load(force = false): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const result: OwnedGamesResult = await window.imageLibrary.fetchOwnedGames(force)
    games.value = result.games
    if (result.error) errorMessage.value = result.error
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <main class="career-shell">
    <section class="hero-panel">
      <h1>职业游戏生涯拼图</h1>
      <p class="description">按游戏时长分档展示你的 Steam 游戏库。玩得越多，封面越大。</p>

      <div class="career-controls">
        <div class="toggle-group">
          <button :class="{ active: orientation === 'landscape' }" @click="orientation = 'landscape'">横版</button>
          <button :class="{ active: orientation === 'portrait' }" @click="orientation = 'portrait'">竖版</button>
        </div>
        <button class="secondary-button" :disabled="loading" @click="load(true)">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
        <span class="stats" v-if="games.length > 0">{{ playedCount }} 个游戏 · {{ totalHours }}h</span>
      </div>
    </section>

    <section class="content-panel">
      <div v-if="errorMessage" class="state-card error-state">
        {{ errorMessage }}
        <button class="secondary-button" @click="load(true)">重试</button>
      </div>
      <div v-else-if="loading" class="state-card">加载中…</div>
      <div v-else-if="playedCount === 0" class="state-card">没有已游玩的游戏。</div>
      <template v-else>
        <div v-for="tier in tierOrder" :key="tier" v-show="tiered[tier].length > 0" class="tier-block">
          <h2 class="tier-label">{{ tierLabels[tier] }} · {{ tiered[tier].length }} 个</h2>
          <div class="cover-row">
            <div
              v-for="game in tiered[tier]"
              :key="game.appid"
              class="cover"
              :style="{ width: coverWidth(tier) + 'px' }"
            >
              <img
                :src="coverUrl(game.appid)"
                :alt="game.name"
                loading="lazy"
                @error="(e) => (e.target as HTMLImageElement).classList.add('cover-broken')"
              />
              <div class="cover-meta">
                <strong>{{ game.name || `#${game.appid}` }}</strong>
                <span>{{ formatPlaytime(game.playtimeForever) }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.career-shell {
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
h1 {
  margin: 0 0 12px;
  font-size: 32px;
}
.description {
  max-width: 720px;
  color: #b6c3d4;
  line-height: 1.7;
  margin: 0;
}
.career-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
}
.toggle-group {
  display: flex;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 12px;
  overflow: hidden;
}
.toggle-group button {
  padding: 8px 16px;
  border: 0;
  background: transparent;
  color: #cbd5e1;
  font-weight: 700;
  cursor: pointer;
}
.toggle-group button.active {
  background: rgba(125, 211, 252, 0.2);
  color: #7dd3fc;
}
.career-controls .secondary-button {
  padding: 8px 16px;
  border: 1px solid rgba(147, 197, 253, 0.34);
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.22);
  color: #dbeafe;
  font-weight: 700;
  cursor: pointer;
}
.career-controls .secondary-button:disabled {
  opacity: 0.5;
  cursor: wait;
}
.stats {
  color: #93c5fd;
  font-weight: 700;
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
.tier-block {
  margin-bottom: 32px;
}
.tier-label {
  margin: 0 0 14px;
  font-size: 18px;
  color: #7dd3fc;
}
.cover-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.cover {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #0f172a;
}
.cover img {
  display: block;
  width: 100%;
  height: auto;
}
.cover-broken {
  visibility: hidden;
}
.cover-meta {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px 6px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
  color: #e2e8f0;
}
.cover-meta strong {
  display: block;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cover-meta span {
  font-size: 10px;
  color: #7dd3fc;
}
</style>
```

- [ ] **Step 2: typecheck**

Run: `npx vue-tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/components/CareerCollage.vue
git commit -m "feat: add CareerCollage display component"
```

---

### Task 5: App.vue tab 导航

**Files:**
- Modify: `src/App.vue` — 顶部加 tab 栏，现有 `<main>` 用 `v-show` 包裹，`CareerCollage` 用 `v-if`

**Interfaces:**
- Consumes: `CareerCollage`（Task 4）
- Produces: 双 tab 应用骨架

- [ ] **Step 1: App.vue 顶部加 tab 状态与切换栏**

在 [src/App.vue](src/App.vue) `<script setup>` 开头（现有 import 之后）添加：

```typescript
import CareerCollage from './components/CareerCollage.vue'

const activeTab = ref<'browser' | 'career'>('browser')
```

（`ref` 已在现有 import 中。）

- [ ] **Step 2: 模板加 tab 栏 + 包裹现有 main**

在 [src/App.vue](src/App.vue) `<template>` 的 `<main class="page-shell">` **之前**插入 tab 栏，并把现有 `<main class="page-shell">…</main>` 用 `<div v-show="activeTab === 'browser'">` 包裹，再加 CareerCollage：

```vue
<template>
  <div class="app-shell">
    <nav class="tab-bar">
      <button :class="{ active: activeTab === 'browser' }" @click="activeTab = 'browser'">图片浏览器</button>
      <button :class="{ active: activeTab === 'career' }" @click="activeTab = 'career'">职业游戏生涯拼图</button>
    </nav>

    <div v-show="activeTab === 'browser'">
      <main class="page-shell">
        <!-- 现有 main 内容不变 -->
      </main>
    </div>

    <CareerCollage v-if="activeTab === 'career'" />
  </div>
</template>
```

注意：现有 `<main class="page-shell">…</main>` 整段内容保持原样，只是外面包一层 `<div v-show>`。

- [ ] **Step 3: 加 tab 栏样式**

在 [src/App.vue](src/App.vue) `<style scoped>` 开头添加：

```css
.app-shell {
  min-height: 100vh;
}
.tab-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  gap: 4px;
  padding: 8px 40px;
  background: rgba(15, 23, 42, 0.95);
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
}
.tab-bar button {
  padding: 8px 18px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #94a3b8;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.tab-bar button.active {
  background: rgba(125, 211, 252, 0.18);
  color: #7dd3fc;
}
```

- [ ] **Step 4: typecheck**

Run: `npx vue-tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: 手动验证**

Run: `npm run dev:electron`
切到「职业游戏生涯拼图」tab，确认：
- 配置好 apiKey/steamId 后游戏列表加载
- 按档位展示封面
- 横/竖切换即时重排
- 「图片浏览器」tab 功能不受影响

- [ ] **Step 6: Commit**

```bash
git add src/App.vue
git commit -m "feat: add tab navigation between browser and career collage"
```

---

### Task 6: PNG 导出

**Files:**
- Modify: `src/components/CareerCollage.vue` — 加导出按钮 + canvas 绘制逻辑

**Interfaces:**
- Consumes: `window.imageLibrary.saveCollage(buffer, suggestedName)`（已有）、`tiered`、`orientation`（Task 4 内部状态）
- Produces: 「导出图片」按钮生成 PNG

- [ ] **Step 1: CareerCollage.vue 加导出状态与函数**

在 [src/components/CareerCollage.vue](src/components/CareerCollage.vue) `<script setup>` 中（`load` 函数之前）添加：

```typescript
const isExporting = ref(false)

const exportSizes: Record<Orientation, Record<Tier, number>> = {
  landscape: { xl: 440, l: 320, m: 240, s: 160 },
  portrait: { xl: 260, l: 190, m: 140, s: 96 },
}

function aspectRatio(): number {
  return orientation.value === 'landscape' ? 460 / 215 : 600 / 900
}

async function loadBitmap(appid: number): Promise<ImageBitmap | null> {
  try {
    const url = coverUrl(appid)
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return await createImageBitmap(blob)
  } catch {
    return null
  }
}

async function exportPng(): Promise<void> {
  if (isExporting.value) return
  isExporting.value = true
  try {
    const padding = 40
    const canvasWidth = 1920
    const ratio = aspectRatio()
    const ctxCanvas = document.createElement('canvas')
    const ctx = ctxCanvas.getContext('2d')
    if (!ctx) return

    // 先计算总高度
    let y = padding
    const tierSections: { tier: Tier; covers: OwnedGame[]; rowHeight: number }[] = []
    for (const tier of tierOrder) {
      const covers = tiered.value[tier]
      if (covers.length === 0) continue
      const w = exportSizes[orientation.value][tier]
      const h = w / ratio
      tierSections.push({ tier, covers, rowHeight: h })
      y += 50 // 档位标签高度
      // 每行能放几个
      const usableWidth = canvasWidth - padding * 2
      const perRow = Math.max(1, Math.floor(usableWidth / (w + 10)))
      const rows = Math.ceil(covers.length / perRow)
      y += rows * (h + 10)
    }
    const totalHeight = y + padding
    ctxCanvas.width = canvasWidth
    ctxCanvas.height = totalHeight
    ctx.fillStyle = '#101827'
    ctx.fillRect(0, 0, canvasWidth, totalHeight)

    // 绘制每个档位
    let cursorY = padding
    for (const section of tierSections) {
      ctx.fillStyle = '#7dd3fc'
      ctx.font = 'bold 28px sans-serif'
      ctx.fillText(
        `${tierLabels[section.tier]} · ${section.covers.length} 个`,
        padding,
        cursorY + 28,
      )
      cursorY += 50

      const w = exportSizes[orientation.value][section.tier]
      const h = section.rowHeight
      const usableWidth = canvasWidth - padding * 2
      const perRow = Math.max(1, Math.floor(usableWidth / (w + 10)))
      // 并行加载该档位所有封面
      const bitmaps = await Promise.all(section.covers.map((g) => loadBitmap(g.appid)))
      for (let i = 0; i < section.covers.length; i++) {
        const game = section.covers[i]
        const bmp = bitmaps[i]
        const col = i % perRow
        const x = padding + col * (w + 10)
        // cover 裁剪绘制
        if (bmp) {
          const srcRatio = bmp.width / bmp.height
          let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height
          if (srcRatio > ratio) {
            sw = bmp.height * ratio
            sx = (bmp.width - sw) / 2
          } else {
            sh = bmp.width / ratio
            sy = (bmp.height - sh) / 2
          }
          ctx.drawImage(bmp, sx, sy, sw, sh, x, cursorY, w, h)
        } else {
          ctx.fillStyle = '#1e293b'
          ctx.fillRect(x, cursorY, w, h)
        }
        // 底部文字条
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(x, cursorY + h - 28, w, 28)
        ctx.fillStyle = '#e2e8f0'
        ctx.font = 'bold 13px sans-serif'
        const name = game.name || `#${game.appid}`
        ctx.fillText(name.slice(0, 20), x + 6, cursorY + h - 14)
        ctx.fillStyle = '#7dd3fc'
        ctx.font = '12px sans-serif'
        ctx.fillText(formatPlaytime(game.playtimeForever), x + 6, cursorY + h - 4)
      }
      const rows = Math.ceil(section.covers.length / perRow)
      cursorY += rows * (h + 10)
    }

    const blob = await new Promise<Blob | null>((resolve) => ctxCanvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    const buffer = await blob.arrayBuffer()
    await window.imageLibrary.saveCollage(buffer, 'career-collage.png')
  } finally {
    isExporting.value = false
  }
}
```

- [ ] **Step 2: 模板加导出按钮**

在 [src/components/CareerCollage.vue](src/components/CareerCollage.vue) 的 `.career-controls` 内，「刷新」按钮之后添加：

```vue
<button class="secondary-button" :disabled="isExporting || playedCount === 0" @click="exportPng">
  {{ isExporting ? '导出中…' : '导出图片' }}
</button>
```

- [ ] **Step 3: typecheck**

Run: `npx vue-tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 手动验证**

Run: `npm run dev:electron`
切到「职业游戏生涯拼图」tab，点「导出图片」，确认：
- 弹出保存对话框
- 生成的 PNG 包含所有档位、封面、游戏名、时长
- 封面跨域加载不污染 canvas（`fetch` + `createImageBitmap` 走 CORS）

- [ ] **Step 5: Commit**

```bash
git add src/components/CareerCollage.vue
git commit -m "feat: export career collage as PNG via canvas"
```

---

## Self-Review 结论

- **Spec coverage**: 所有 spec 章节（架构/数据流/分档/尺寸/布局/导出/边界/缓存/性能）均有对应 task
- **Placeholder scan**: 无 TBD/TODO，所有 step 含完整代码
- **Type consistency**: `OwnedGame`、`tierGames`、`Orientation`、`Tier` 在各 task 间签名一致
