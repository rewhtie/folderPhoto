# 游戏评测排名（档位金字塔）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「游戏评测排名」Tab，导入游戏图片并手动拖拽分入「夯/顶级/人上人/NPC/拉」五档，持久化并导出成品 PNG。

**Architecture:** 沿用项目现有的 Electron + Vue 3 + TS 结构。数据层加 `electron/tierListStore.ts`（读写 `tierList.json`，仿 `collectionsStore.ts`）；纯逻辑放 `src/shared/tierList.ts`（配单测）；页面为 `src/components/ReviewRank.vue`；跨 Tab 图片桥用 `src/shared/reviewPool.ts`（reactive 数组）。IPC 经 `main.ts` + `preload.cts` + `env.d.ts` 暴露。

**Tech Stack:** Electron、Vue 3 `<script setup>`、TypeScript、Vitest、HTML5 拖拽、Canvas。

**Spec:** [docs/superpowers/specs/2026-08-19-game-review-tierlist-design.md](../specs/2026-08-19-game-review-tierlist-design.md)

## Global Constraints

- 档位键固定为 `夯 / 顶级 / 人上人 / NPC / 拉 / pool`，显示顺序用 `TIER_ORDER = ['夯', '顶级', '人上人', 'NPC', '拉']`。
- 图片 URL 统一用现有 `local-image://file/<encodeURIComponent(absolutePath)>` 协议（`toImageSourceUrl` / `pickLocalImages` 均已产出此格式）。
- 持久化文件：`tierList.json`，落盘位置与其他 store 一致（`collectionsDirectory`）。
- 提交信息结尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 测试命令：`npm test`（vitest run），类型检查：`npm run typecheck`。

---

### Task 1: 纯逻辑模块与单测（tier list 状态操作）

**Files:**
- Create: `src/shared/tierList.ts`
- Test: `src/shared/tierList.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces:
  - `export type TierKey = '夯' | '顶级' | '人上人' | 'NPC' | '拉' | 'pool'`
  - `export const TIER_ORDER: readonly TierKey[] = ['夯', '顶级', '人上人', 'NPC', '拉']`
  - `export interface TierEntry { id: string; src: string; label: string }`
  - `export interface TierList { 夯: TierEntry[]; 顶级: TierEntry[]; 人上人: TierEntry[]; NPC: TierEntry[]; 拉: TierEntry[]; pool: TierEntry[] }`
  - `export function emptyTierList(): TierList`
  - `export function addToPool(list: TierList, entry: TierEntry): TierList` — 去重（按 `id`），重复则原样返回
  - `export function moveEntry(list: TierList, fromTier: TierKey, fromIdx: number, toTier: TierKey, toIdx: number): TierList` — 源档取出该项，插入目标档 `toIdx`（`toIdx` 是「取出后」的插入位置，含源档场景）
  - `export function tierLabelFromUrl(src: string, fallback?: string): string` — 从 `local-image://` URL 解析文件名（无扩展名）作为 label；

- [ ] **Step 1: 写失败测试**

创建 `src/shared/tierList.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  addToPool,
  emptyTierList,
  moveEntry,
  tierLabelFromUrl,
  TIER_ORDER,
  type TierEntry,
  type TierList,
} from './tierList'

const e = (id: string): TierEntry => ({ id, src: `local-image://file/x/${id}.jpg`, label: id })

describe('emptyTierList', () => {
  it('返回全空档位', () => {
    const list = emptyTierList()
    expect(list).toEqual({ 夯: [], 顶级: [], 人上人: [], NPC: [], 拉: [], pool: [] })
  })
})

describe('addToPool', () => {
  it('追加到待分区末尾', () => {
    const list = emptyTierList()
    const next = addToPool(list, e('a'))
    expect(next.pool.map((x) => x.id)).toEqual(['a'])
  })
  it('按 id 去重', () => {
    const list = addToPool(emptyTierList(), e('a'))
    const next = addToPool(list, e('a'))
    expect(next.pool.length).toBe(1)
  })
  it('不改原对象', () => {
    const list = emptyTierList()
    const next = addToPool(list, e('a'))
    expect(list.pool.length).toBe(0)
    expect(next).not.toBe(list)
  })
})

describe('moveEntry', () => {
  const seeded: TierList = {
    pool: [e('p1'), e('p2')],
    夯: [e('s1'), e('s2')],
    顶级: [],
    人上人: [],
    NPC: [],
    拉: [],
  }
  it('跨档移动：pool[0] → 夯 末尾', () => {
    const next = moveEntry(seeded, 'pool', 0, '夯', 2)
    expect(next.pool.map((x) => x.id)).toEqual(['p2'])
    expect(next.夯.map((x) => x.id)).toEqual(['s1', 's2', 'p1'])
  })
  it('档内换序：夯[0] → 夯 末尾', () => {
    const next = moveEntry(seeded, '夯', 0, '夯', 2)
    expect(next.夯.map((x) => x.id)).toEqual(['s2', 's1'])
  })
})

describe('tierLabelFromUrl', () => {
  it('解析文件名去扩展名', () => {
    expect(tierLabelFromUrl('local-image://file/C%3A%5Cimg%5Celden-ring.jpg')).toBe('elden-ring')
  })
  it('无文件名用 fallback', () => {
    expect(tierLabelFromUrl('local-image://file/', '默认')).toBe('默认')
  })
  it('TIER_ORDER 顺序正确', () => {
    expect([...TIER_ORDER]).toEqual(['夯', '顶级', '人上人', 'NPC', '拉'])
  })
})
```

- [ ] **Step 2: 运行验证失败**

Run: `npm test -- src/shared/tierList.test.ts`
Expected: FAIL —— `Cannot find module './tierList'`

- [ ] **Step 3: 实现模块**

创建 `src/shared/tierList.ts`：

```ts
export type TierKey = '夯' | '顶级' | '人上人' | 'NPC' | '拉' | 'pool'

export const TIER_ORDER: readonly TierKey[] = ['夯', '顶级', '人上人', 'NPC', '拉']

export interface TierEntry {
  id: string
  src: string
  label: string
}

export interface TierList {
  夯: TierEntry[]
  顶级: TierEntry[]
  人上人: TierEntry[]
  NPC: TierEntry[]
  拉: TierEntry[]
  pool: TierEntry[]
}

export function emptyTierList(): TierList {
  return { 夯: [], 顶级: [], 人上人: [], NPC: [], 拉: [], pool: [] }
}

function clone(list: TierList): TierList {
  return {
    夯: [...list.夯],
    顶级: [...list.顶级],
    人上人: [...list.人上人],
    NPC: [...list.NPC],
    拉: [...list.拉],
    pool: [...list.pool],
  }
}

export function addToPool(list: TierList, entry: TierEntry): TierList {
  if (list.pool.some((x) => x.id === entry.id)) return list
  const next = clone(list)
  next.pool.push(entry)
  return next
}

export function moveEntry(
  list: TierList,
  fromTier: TierKey,
  fromIdx: number,
  toTier: TierKey,
  toIdx: number,
): TierList {
  const next = clone(list)
  const from = next[fromTier]
  if (fromIdx < 0 || fromIdx >= from.length) return list
  const [moved] = from.splice(fromIdx, 1)
  const to = next[toTier]
  const insertAt = Math.max(0, Math.min(toIdx, to.length))
  to.splice(insertAt, 0, moved)
  return next
}

export function tierLabelFromUrl(src: string, fallback = ''): string {
  try {
    const url = new URL(src)
    const encoded = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname
    const full = decodeURIComponent(encoded)
    const name = full.split(/[\\/]/).pop() ?? ''
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.slice(0, dot) : name || fallback
  } catch {
    return fallback
  }
}
```

- [ ] **Step 4: 运行通过**

Run: `npm test -- src/shared/tierList.test.ts`
Expected: PASS（4 个 describe 全绿）

- [ ] **Step 5: 提交**

```bash
git add src/shared/tierList.ts src/shared/tierList.test.ts
git commit -m "feat(tierlist): tier list state helpers + tests"
```

---

### Task 2: 主进程存储层（tierList.json）

**Files:**
- Create: `electron/tierListStore.ts`
- Modify: `electron/main.ts`

**Interfaces:**
- Consumes: `src/shared/tierList.ts` 的 `TierList`、`emptyTierList` 类型。
- Produces:
  - `export function setTierListFilePath(filePath: string): void`
  - `export async function loadTierList(): Promise<TierList>`
  - `export async function saveTierList(list: TierList): Promise<void>`

- [ ] **Step 1: 写存储模块**

创建 `electron/tierListStore.ts`（仿 `collectionsStore.ts`）：

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { emptyTierList, type TierList } from '../src/shared/tierList.js'

let tierListFilePath = join(process.cwd(), 'tierList.json')

export function setTierListFilePath(filePath: string): void {
  tierListFilePath = filePath
}

export async function loadTierList(): Promise<TierList> {
  try {
    const raw = await readFile(tierListFilePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return isValidTierList(parsed) ? normalize(parsed) : emptyTierList()
  } catch {
    return emptyTierList()
  }
}

export async function saveTierList(list: TierList): Promise<void> {
  await writeFile(tierListFilePath, JSON.stringify(list, null, 2), 'utf-8')
}

function isValidTierList(value: unknown): value is Partial<TierList> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalize(parsed: Partial<TierList>): TierList {
  const base = emptyTierList()
  for (const key of Object.keys(base) as (keyof TierList)[]) {
    const arr = parsed[key]
    if (Array.isArray(arr)) base[key] = arr.filter(isTierEntry)
  }
  return base
}

function isTierEntry(value: unknown): value is TierList[keyof TierList][number] {
  if (typeof value !== 'object' || value === null) return false
  const o = value as { id?: unknown; src?: unknown; label?: unknown }
  return typeof o.id === 'string' && typeof o.src === 'string' && typeof o.label === 'string'
}
```

- [ ] **Step 2: 接入 main.ts**

在 `electron/main.ts` 顶部 import（放在 `collectionsStore` import 之后）：

```ts
import { loadTierList, saveTierList, setTierListFilePath } from './tierListStore.js'
```

在 `setCollectionsFilePath(...)` 那一段下方加：

```ts
setTierListFilePath(join(collectionsDirectory, 'tierList.json'))
```

在 `ipcMain.handle('collections:save', ...)` 之后加两个 handler：

```ts
ipcMain.handle('tier-list:load', () => {
  return loadTierList()
})

ipcMain.handle('tier-list:save', (_event, list: TierList) => {
  return saveTierList(list)
})
```

并在文件顶部 import 类型：

```ts
import type { TierList } from '../src/shared/tierList.js'
```

- [ ] **Step 3: 类型检查验证**

Run: `npm run typecheck`
Expected: PASS（若 `main.ts` 有类型报错则修到通过）

- [ ] **Step 4: 提交**

```bash
git add electron/tierListStore.ts electron/main.ts
git commit -m "feat(tierlist): persist tier list to tierList.json via IPC"
```

---

### Task 3: preload 暴露与 TS 类型定义

**Files:**
- Modify: `electron/preload.cts`
- Modify: `src/env.d.ts`

**Interfaces:**
- Consumes: `TierList` 类型（`src/shared/tierList.ts`）、IPC 通道 `tier-list:load` / `tier-list:save`（Task 2）。
- Produces: 渲染进程 `window.imageLibrary.loadTierList()` / `window.imageLibrary.saveTierList(list)`。

- [ ] **Step 1: 修改 preload.cts**

在 `electron/preload.cts` 顶部 import 加：

```ts
import type { TierList } from '../src/shared/tierList.js'
```

在 `contextBridge.exposeInMainWorld('imageLibrary', { ... })` 内、`fetchOwnedGames(...)` 之后追加：

```ts
  loadTierList(): Promise<TierList> {
    return ipcRenderer.invoke('tier-list:load')
  },
  saveTierList(list: TierList): Promise<void> {
    return ipcRenderer.invoke('tier-list:save', list)
  },
```

- [ ] **Step 2: 修改 env.d.ts**

在 `src/env.d.ts` 顶部 import 区加：

```ts
import type { TierList } from './shared/tierList'
```

在 `Window.imageLibrary` 接口内、`fetchOwnedGames(...)` 之后追加：

```ts
      loadTierList(): Promise<TierList>
      saveTierList(list: TierList): Promise<void>
```

- [ ] **Step 3: 类型检查验证**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add electron/preload.cts src/env.d.ts
git commit -m "feat(tierlist): expose tier list IPC to renderer"
```

---

### Task 4: 跨 Tab 图片桥 reviewPool

**Files:**
- Create: `src/shared/reviewPool.ts`

**Interfaces:**
- Consumes: `TierEntry` 类型（`src/shared/tierList.ts`）。
- Produces:
  - `export const reviewPool = ref<TierEntry[]>([])` —— Vue `ref`，浏览器页与评测页共享。
  - `export function addToReviewPool(entries: TierEntry[]): void` —— 去重追加（按 `id`）。
  - `export function takeReviewPool(): TierEntry[]` —— 返回并清空（评测页载入时取走）。

- [ ] **Step 1: 写模块**

创建 `src/shared/reviewPool.ts`：

```ts
import { ref } from 'vue'
import type { TierEntry } from './tierList'

// 浏览器页「加入评测」写入，评测页载入时取走并清空，作为跨 Tab 的图片桥
export const reviewPool = ref<TierEntry[]>([])

export function addToReviewPool(entries: TierEntry[]): void {
  const seen = new Set(reviewPool.value.map((e) => e.id))
  for (const entry of entries) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    reviewPool.value.push(entry)
  }
}

export function takeReviewPool(): TierEntry[] {
  const drained = [...reviewPool.value]
  reviewPool.value = []
  return drained
}
```

- [ ] **Step 2: 提交**

```bash
git add src/shared/reviewPool.ts
git commit -m "feat(tierlist): shared reviewPool bridge between browser and review tabs"
```

---

### Task 5: ReviewRank 页面组件

**Files:**
- Create: `src/components/ReviewRank.vue`

**Interfaces:**
- Consumes: `tierList.ts`（`TIER_ORDER`、`emptyTierList`、`moveEntry`、`addToPool`、`tierLabelFromUrl`、类型）、`reviewPool.ts`（`takeReviewPool`、`addToReviewPool`）、`window.imageLibrary.pickLocalImages()` / `loadTierList()` / `saveTierList()` / `saveCollage()`。
- Produces: 一个自包含的 `<ReviewRank />` 组件（无 props/emits）。`TierList` 视觉状态内部 `ref<TierList>`。

- [ ] **Step 1: 写组件骨架 + 载入/保存 + 拖拽分档 + 导出**

创建 `src/components/ReviewRank.vue`。完整内容如下（含 `<template>` 与 `<style scoped>`）：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  addToPool,
  emptyTierList,
  moveEntry,
  tierLabelFromUrl,
  TIER_ORDER,
  type TierEntry,
  type TierKey,
  type TierList,
} from '../shared/tierList'
import { takeReviewPool } from '../shared/reviewPool'

const list = ref<TierList>(emptyTierList())
const isImporting = ref(false)
const isExporting = ref(false)
const errorMessage = ref('')

// 每档封面宽（px），金字塔自上而下递减
const tierWidths: Record<string, number> = {
  夯: 200,
  顶级: 164,
  人上人: 132,
  NPC: 104,
  拉: 80,
  pool: 96,
}

const tierColors: Record<string, string> = {
  夯: '#7dd3fc',
  顶级: '#a5b4fc',
  人上人: '#fcd34d',
  NPC: '#fb923c',
  拉: '#f87171',
  pool: '#94a3b8',
}

function tierLabel(tier: string): string {
  return tier === 'pool' ? '待分区' : tier
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void window.imageLibrary.saveTierList(list.value)
  }, 400)
}

onMounted(async () => {
  list.value = await window.imageLibrary.loadTierList()
  // 取走浏览器页送来的图片
  const incoming = takeReviewPool()
  if (incoming.length > 0) {
    let next = list.value
    for (const entry of incoming) next = addToPool(next, entry)
    list.value = next
    scheduleSave()
  }
})

async function importLocalImages(): Promise<void> {
  isImporting.value = true
  errorMessage.value = ''
  try {
    const picked = await window.imageLibrary.pickLocalImages()
    if (!picked || picked.length === 0) return
    let next = list.value
    for (const src of picked) {
      next = addToPool(next, { id: src, src, label: tierLabelFromUrl(src, src) })
    }
    list.value = next
    scheduleSave()
  } catch {
    errorMessage.value = '导入图片失败'
  } finally {
    isImporting.value = false
  }
}

// --- 拖拽：dragFrom 存 { tier, idx } ---
let dragFrom: { tier: TierKey; idx: number } | null = null

function onDragStart(tier: TierKey, idx: number, e: DragEvent): void {
  dragFrom = { tier, idx }
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(e: DragEvent): void {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDrop(tier: TierKey, idx: number): void {
  if (!dragFrom) return
  const { tier: fromTier, idx: fromIdx } = dragFrom
  dragFrom = null
  // 目标下标：默认插入末尾；同档时用 hover 的 idx
  const toIdx = idx
  list.value = moveEntry(list.value, fromTier, fromIdx, tier, toIdx)
  scheduleSave()
}

function onDragEnd(): void {
  dragFrom = null
}

// --- 导出 PNG ---
async function loadBitmap(src: string): Promise<ImageBitmap | null> {
  try {
    const resp = await fetch(src)
    if (!resp.ok) return null
    return await createImageBitmap(await resp.blob())
  } catch {
    return null
  }
}

async function exportPng(): Promise<void> {
  if (isExporting.value) return
  isExporting.value = true
  errorMessage.value = ''
  try {
    const canvasWidth = 1920
    const padding = 40
    const rowH = 140
    const labelH = 40
    const sections = [...TIER_ORDER, 'pool' as const].filter((t) => list.value[t].length > 0)

    let totalH = padding
    for (const tier of sections) {
      totalH += labelH + rowH + 16
    }
    totalH += padding

    const canvas = document.createElement('canvas')
    canvas.width = canvasWidth
    canvas.height = totalH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#101827'
    ctx.fillRect(0, 0, canvasWidth, totalH)

    let y = padding
    for (const tier of sections) {
      const entries = list.value[tier]
      // 档位标签
      ctx.fillStyle = tierColors[tier]
      ctx.fillRect(padding, y, 8, labelH)
      ctx.fillStyle = tier === 'pool' ? '#94a3b8' : tierColors[tier]
      ctx.font = 'bold 22px sans-serif'
      ctx.fillText(`${tierLabel(tier)} · ${entries.length}`, padding + 20, y + 28)
      y += labelH

      // 封面横排
      const w = tierWidths[tier]
      const bitmaps = await Promise.all(entries.map((e) => loadBitmap(e.src)))
      for (let i = 0; i < entries.length; i++) {
        const x = padding + i * (w + 10)
        const bmp = bitmaps[i]
        if (bmp) {
          const ratio = bmp.width / bmp.height
          let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height
          if (ratio > 460 / 215) {
            sw = bmp.height * (460 / 215)
            sx = (bmp.width - sw) / 2
          } else {
            sh = bmp.width / (460 / 215)
            sy = (bmp.height - sh) / 2
          }
          ctx.drawImage(bmp, sx, sy, sw, sh, x, y, w, w / (460 / 215))
        } else {
          ctx.fillStyle = '#1e293b'
          ctx.fillRect(x, y, w, w / (460 / 215))
        }
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(x, y + w / (460 / 215) - 24, w, 24)
        ctx.fillStyle = '#e2e8f0'
        ctx.font = 'bold 12px sans-serif'
        ctx.fillText(entries[i].label.slice(0, 18), x + 6, y + w / (460 / 215) - 12)
      }
      y += rowH + 16
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    const buffer = await blob.arrayBuffer()
    await window.imageLibrary.saveCollage(buffer, 'review-rank.png')
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '导出失败'
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <main class="review-shell">
    <section class="hero-panel">
      <h1>游戏评测排名</h1>
      <p class="description">导入游戏图片，拖到对应档位排出你的个人金字塔。</p>
      <div class="review-controls">
        <button type="button" :disabled="isImporting" @click="importLocalImages">
          {{ isImporting ? '导入中…' : '导入图片' }}
        </button>
        <button
          class="secondary"
          type="button"
          :disabled="isExporting"
          @click="exportPng"
        >
          {{ isExporting ? '导出中…' : '导出图片' }}
        </button>
      </div>
    </section>

    <section class="content-panel">
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

      <div
        v-for="tier in [...TIER_ORDER, 'pool']"
        :key="tier"
        class="tier-row"
        @dragover="onDragOver"
        @drop="onDrop(tier, list[tier].length)"
      >
        <h2 class="tier-head" :style="{ color: tierColors[tier] }">
          {{ tierLabel(tier) }} <span class="count">{{ list[tier].length }}</span>
        </h2>
        <div class="cover-row">
          <div
            v-for="(entry, idx) in list[tier]"
            :key="entry.id"
            class="cover"
            :style="{ width: tierWidths[tier] + 'px' }"
            draggable="true"
            @dragstart="onDragStart(tier, idx, $event)"
            @dragover="(e) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'move' }"
            @drop="onDrop(tier, idx)"
            @dragend="onDragEnd"
          >
            <img :src="entry.src" :alt="entry.label" loading="lazy" draggable="false" />
            <div class="cover-meta">{{ entry.label }}</div>
          </div>
          <div v-if="list[tier].length === 0" class="empty-hint">拖到这里</div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.review-shell {
  min-height: 100vh;
  padding: 40px;
  background: radial-gradient(circle at top left, rgba(59, 130, 246, 0.22), transparent 34rem),
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
  margin: 0;
  color: #b6c3d4;
  line-height: 1.7;
}
.review-controls {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
.review-controls button {
  padding: 8px 18px;
  border: 0;
  border-radius: 12px;
  background: #7dd3fc;
  color: #082f49;
  font-weight: 800;
  cursor: pointer;
}
.review-controls button.secondary {
  background: rgba(59, 130, 246, 0.22);
  border: 1px solid rgba(147, 197, 253, 0.34);
  color: #dbeafe;
}
.review-controls button:disabled {
  opacity: 0.5;
  cursor: wait;
}
.content-panel {
  margin-top: 24px;
}
.error-text {
  color: #fca5a5;
}
.tier-row {
  margin-bottom: 20px;
  padding: 14px 16px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.55);
}
.tier-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 18px;
}
.tier-head .count {
  font-size: 13px;
  color: #94a3b8;
}
.cover-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px;
  min-height: 60px;
}
.cover {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #0f172a;
  cursor: grab;
}
.cover:active {
  cursor: grabbing;
}
.cover img {
  display: block;
  width: 100%;
  height: auto;
}
.cover-meta {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 3px 6px;
  font-size: 11px;
  color: #e2e8f0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty-hint {
  align-self: center;
  color: #475569;
  font-size: 13px;
}
</style>
```

- [ ] **Step 2: 类型检查验证**

Run: `npm run typecheck`
Expected: PASS（Vue SFC 类型校验通过）

- [ ] **Step 3: 提交**

```bash
git add src/components/ReviewRank.vue
git commit -m "feat(tierlist): ReviewRank pyramid page with drag ranking + PNG export"
```

---

### Task 6: 接入 App.vue（Tab + 浏览器页「加入评测」）

**Files:**
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `ReviewRank.vue`（Task 5）、`reviewPool.ts`（`addToReviewPool`）、`tierList.ts`（`tierLabelFromUrl`、`TierEntry`）。
- Produces: 顶部新增「游戏评测排名」Tab；浏览器页 `selection-bar` 新增「加入评测」按钮。

- [ ] **Step 1: 改 import 与状态**

在 [src/App.vue](src/App.vue) 顶部 import 区加：

```ts
import ReviewRank from './components/ReviewRank.vue'
import { addToReviewPool } from './shared/reviewPool'
import { tierLabelFromUrl, type TierEntry } from './shared/tierList'
```

将 `activeTab` 类型改为：

```ts
const activeTab = ref<'browser' | 'career' | 'review'>('browser')
```

- [ ] **Step 2: 加「加入评测」函数**

在 `App.vue` 的 `<script setup>` 内（`openFreeCollage` 之后）加：

```ts
function addSelectedToReview(): void {
  if (selectedPaths.value.size === 0) return
  const entries: TierEntry[] = []
  for (const image of images.value) {
    if (!selectedPaths.value.has(image.absolutePath)) continue
    entries.push({
      id: image.fileUrl,
      src: image.fileUrl,
      label: image.appName || tierLabelFromUrl(image.fileUrl, image.relativePath),
    })
  }
  addToReviewPool(entries)
  clearSelection()
  showToast(`已把 ${entries.length} 张图加入评测待分区`)
}
```

- [ ] **Step 3: 改 Tab 栏**

在 `tab-bar` 内、「职业游戏生涯拼图」按钮之后加：

```html
<button :class="{ active: activeTab === 'review' }" @click="activeTab = 'review'">游戏评测排名</button>
```

- [ ] **Step 4: 改 selection-bar 与挂载组件**

在 `selection-bar`（floating-selection）内、「拼图」按钮之后加：

```html
<button class="secondary-button" type="button" @click="addSelectedToReview">加入评测</button>
```

在 `<CareerCollage v-if="activeTab === 'career'" />` 之后加：

```html
<ReviewRank v-if="activeTab === 'review'" />
```

- [ ] **Step 5: 类型检查 + 构建验证**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/App.vue
git commit -m "feat(tierlist): wire review tab + add-selected-to-review button"
```

---

### Task 7: 全量验证与收尾

**Files:** 无新增。

- [ ] **Step 1: 跑全套测试**

Run: `npm test`
Expected: 全部通过（含 `tierList.test.ts` 与既有测试）

- [ ] **Step 2: 完整类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: 手动冒烟（可选，需 dev 环境）**

Run: `npm run dev:electron`
Expected: 顶部出现「游戏评测排名」Tab；浏览器页选中图片后「加入评测」可写入待分区；评测页可导入图片、拖拽分档、导出 PNG；重开后档位保留。

- [ ] **Step 4: 提交（如手动验证有微调）**

```bash
git add -A
git commit -m "feat(tierlist): game review tier pyramid"
```

---

## Self-Review 结论

- **Spec 覆盖**：数据模型 → Task 1/2；持久化 → Task 2/3；两种图片来源 → Task 5（文件选择器）+ Task 6（浏览器页勾选，经 reviewPool Task 4）；拖拽分档/排序/回 pool → Task 1 `moveEntry` + Task 5 交互；导出 PNG → Task 5；Tab 接入 → Task 6；测试 → Task 1 + Task 7。全部覆盖，无缺口。
- **占位符扫描**：无 TBD/TODO；所有代码步骤含完整代码块。
- **类型一致性**：`TierKey`/`TierList`/`emptyTierList`/`moveEntry`/`addToPool`/`tierLabelFromUrl`/`takeReviewPool`/`addToReviewPool` 跨 Task 命名一致；IPC 通道 `tier-list:load`/`tier-list:save` 在 Task 2/3 一致；`local-image://` 协议格式沿用 `imageProtocol.ts`。