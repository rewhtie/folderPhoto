# 成就数据缓存 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将成就获取统一为 Web API + 永久 JSON 文件缓存，移除本地 fallback。

**Architecture:** 在 main 进程的 `achievementStore.ts` 中新增缓存读写函数，修改 `main.ts` IPC handler 先查缓存再走 API，前端移除本地 fallback 逻辑。

**Tech Stack:** TypeScript, Electron IPC, Node.js fs/promises

## Global Constraints

- 缓存文件路径：`<appDirectory>/achievements/<appId>.json`
- 缓存永不过期，用户不提供手动刷新
- 不再回退到本地 `userdata` 文件

---

### Task 1: 在 achievementStore.ts 中添加缓存函数

**Files:**
- Modify: `electron/achievementStore.ts`
- Test: `electron/achievementStore.test.ts`（新建）

**Interfaces:**
- Produces:
  - `setAchievementCacheBaseDir(dir: string): void` — 设置缓存根目录
  - `loadCachedAchievements(appId: string): Promise<AchievementResult | null>` — 读缓存，不存在返回 null
  - `saveAchievementCache(appId: string, result: AchievementResult): Promise<void>` — 写缓存

- [ ] **Step 1: 写失败测试**

```typescript
// electron/achievementStore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  setAchievementCacheBaseDir,
  loadCachedAchievements,
  saveAchievementCache,
} from './achievementStore.js'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'ach-test-'))
  setAchievementCacheBaseDir(tempDir)
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('achievement cache', () => {
  it('loadCachedAchievements returns null when no cache exists', async () => {
    const result = await loadCachedAchievements('123')
    expect(result).toBeNull()
  })

  it('save + load round-trips correctly', async () => {
    const data = {
      source: 'api' as const,
      achievements: [
        {
          id: 'ACH_1',
          name: 'Test',
          description: 'desc',
          iconUrl: 'https://example.com/icon.jpg',
          iconGrayUrl: 'https://example.com/gray.jpg',
          achieved: true,
          unlockTime: 1700000000,
        },
      ],
    }
    await saveAchievementCache('456', data)

    const loaded = await loadCachedAchievements('456')
    expect(loaded).toEqual(data)
  })

  it('loadCachedAchievements returns null on corrupt JSON', async () => {
    const { writeFile } = await import('node:fs/promises')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(tempDir, 'achievements'), { recursive: true })
    await writeFile(join(tempDir, 'achievements', '789.json'), 'not json!!!')

    const result = await loadCachedAchievements('789')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run electron/achievementStore.test.ts`
Expected: FAIL（函数不存在）

- [ ] **Step 3: 在 achievementStore.ts 顶部添加缓存函数**

在 `achievementStore.ts` 文件头部（`interface Achievement` 之前）插入：

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

let cacheBaseDir = ''

export function setAchievementCacheBaseDir(dir: string): void {
  cacheBaseDir = join(dir, 'achievements')
}

export async function loadCachedAchievements(appId: string): Promise<AchievementResult | null> {
  if (!cacheBaseDir) return null
  const filePath = join(cacheBaseDir, `${appId}.json`)
  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as AchievementResult
    if (parsed && Array.isArray(parsed.achievements)) return parsed
    return null
  } catch {
    return null
  }
}

export async function saveAchievementCache(appId: string, result: AchievementResult): Promise<void> {
  if (!cacheBaseDir) return
  await mkdir(cacheBaseDir, { recursive: true })
  const filePath = join(cacheBaseDir, `${appId}.json`)
  await writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8')
}
```

同时移除第 1 行已有的 `import { readdir, readFile } from 'node:fs/promises'`，将 `readdir` 加入新的 import 行：

```typescript
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run electron/achievementStore.test.ts`
Expected: 3 passed

- [ ] **Step 5: 跑全量测试确认无回归**

Run: `npx vitest run`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add electron/achievementStore.ts electron/achievementStore.test.ts
git commit -m "feat: 添加成就缓存读写函数（loadCachedAchievements / saveAchievementCache）"
```

---

### Task 2: 修改 main.ts 使用缓存

**Files:**
- Modify: `electron/main.ts:1-11`（import 行）和 `electron/main.ts:139-153`（achievements:fetch-api handler）

**Interfaces:**
- Consumes: `setAchievementCacheBaseDir(dir)`, `loadCachedAchievements(appId)`, `saveAchievementCache(appId, result)` from Task 1

- [ ] **Step 1: 更新 import**

将 `electron/main.ts` 第 9 行：
```typescript
import { fetchApiAchievements, loadLocalAchievements } from './achievementStore.js'
```
改为：
```typescript
import {
  fetchApiAchievements,
  loadLocalAchievements,
  setAchievementCacheBaseDir,
  loadCachedAchievements,
  saveAchievementCache,
} from './achievementStore.js'
```

- [ ] **Step 2: 在 setAchievementsBaseDir 之后初始化缓存目录**

在 `electron/main.ts` 第 24 行 `setAchievementsBaseDir(collectionsDirectory)` 之后添加：

```typescript
setAchievementCacheBaseDir(collectionsDirectory)
```

- [ ] **Step 3: 改写 achievements:fetch-api handler**

将 `electron/main.ts` 第 139-153 行：
```typescript
ipcMain.handle('achievements:fetch-api', async (_event, appId: string) => {
  const settings = await loadSettings()
  if (!settings.apiKey || !settings.steamId) {
    return { source: 'api' as const, achievements: [], error: '未配置 Web API' }
  }
  try {
    return await fetchApiAchievements(appId, settings.apiKey, settings.steamId)
  } catch (err) {
    return {
      source: 'api' as const,
      achievements: [],
      error: err instanceof Error ? err.message : '请求失败',
    }
  }
})
```
改为：
```typescript
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
    // 写入缓存（异步，不阻塞返回）
    void saveAchievementCache(appId, result)
    return result
  } catch (err) {
    return {
      source: 'api' as const,
      achievements: [],
      error: err instanceof Error ? err.message : '请求失败',
    }
  }
})
```

- [ ] **Step 4: 跑类型检查**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "feat: achievements:fetch-api 先查缓存再走 API"
```

---

### Task 3: 简化 GameDetail.vue，移除本地 fallback

**Files:**
- Modify: `src/components/GameDetail.vue:36-75`（loadAchievements 函数）

**Interfaces:**
- Consumes: `window.imageLibrary.fetchApiAchievements(appId)` — 返回值不变，但内部已有缓存逻辑

- [ ] **Step 1: 替换 loadAchievements 函数**

将 `src/components/GameDetail.vue` 第 36-75 行的整个 `loadAchievements` 函数替换为：

```typescript
async function loadAchievements(): Promise<void> {
  if (isLoadingAchievements.value) return
  isLoadingAchievements.value = true
  achievementError.value = ''
  achievements.value = []
  cacheMessage.value = ''
  try {
    const result = await window.imageLibrary.fetchApiAchievements(props.appId)
    if (result.error) {
      achievementSource.value = null
      achievementError.value = result.error
      return
    }
    achievementSource.value = result.source
    achievements.value = result.achievements
    // 后台缓存图标
    void cacheIcons(result.achievements)
  } catch (err) {
    achievementError.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    isLoadingAchievements.value = false
  }
}
```

- [ ] **Step 2: 跑类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 跑全量测试**

Run: `npx vitest run`
Expected: 所有通过

- [ ] **Step 4: Commit**

```bash
git add src/components/GameDetail.vue
git commit -m "refactor: 移除成就本地 fallback，统一走 API 缓存"
```

---

### Task 4: 清理 preload.cts 和 env.d.ts

**Files:**
- Modify: `electron/preload.cts:41-43`（移除 loadLocalAchievements）
- Modify: `src/env.d.ts:58`（移除 loadLocalAchievements 声明）

- [ ] **Step 1: 从 preload.cts 移除 loadLocalAchievements**

删除 `electron/preload.cts` 第 41-43 行：
```typescript
  loadLocalAchievements(librarycacheDir: string, appId: string): Promise<AchievementResult> {
    return ipcRenderer.invoke('achievements:load-local', librarycacheDir, appId)
  },
```

- [ ] **Step 2: 从 env.d.ts 移除 loadLocalAchievements 声明**

删除 `src/env.d.ts` 第 58 行：
```typescript
      loadLocalAchievements(librarycacheDir: string, appId: string): Promise<AchievementResult>
```

- [ ] **Step 3: 跑类型检查**

Run: `npx vue-tsc --noEmit && npx tsc -p tsconfig.node.json --noEmit`
Expected: 无错误

- [ ] **Step 4: 跑全量测试**

Run: `npx vitest run`
Expected: 所有通过

- [ ] **Step 5: Commit**

```bash
git add electron/preload.cts src/env.d.ts
git commit -m "cleanup: 移除 loadLocalAchievements preload 暴露和类型声明"
```
