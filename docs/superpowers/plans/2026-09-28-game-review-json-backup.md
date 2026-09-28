# 游戏测评 JSON 备份实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为游戏测评页面增加兼容 Electron 与普通网页的 JSON 导入导出，并持久化不含封面的自定义游戏。

**Architecture:** 使用 `gameReviewBackup.ts` 承担版本化备份的创建、严格外层校验和纯函数合并；`gameReviewStorage.ts` 继续承担 localStorage，并新增自定义游戏存储。`GameReview.vue` 只负责同步当前状态、浏览器下载/选取文件及原子应用合并结果，不新增 Electron IPC。

**Tech Stack:** Vue 3 Composition API、TypeScript、浏览器 Blob/Object URL/File API、localStorage、Vitest

**Spec:** `docs/superpowers/specs/2026-09-28-game-review-json-backup-design.md`

## Global Constraints

- 备份格式固定为 `format: "steam-pc-game-reviews"`、`version: 1`。
- JSON 不得包含任何 Steam 或自定义游戏封面 URL、本地路径。
- 导入冲突时，除时长外均由导入值覆盖；时长保留较大的有效数值。
- 导入文件中的自定义游戏持久化，重启后恢复，但封面为空。
- 导入排序优先；本地独有记录按本地顺序追加；重复和不存在的 ID 移除。
- 使用浏览器标准文件 API；不修改 Electron preload、IPC 或主进程。
- 解析与合并完成前不得修改任何本地或响应式状态。
- 按用户偏好，不自动运行测试、类型检查、构建、应用或浏览器自动化。计划中的任何命令都必须先取得用户明确同意。
- 不提交 Git 记录，除非用户明确要求提交。

## Review Focus

- 损坏 JSON、其他产品 JSON、未来版本 JSON：拒绝导入，并保持所有本地状态不变；由任务 2 的解析测试覆盖。
- 重复自定义 ID、与 Steam 记录冲突的自定义 ID：拒绝导入，避免记录身份不确定；由任务 2 的校验测试覆盖。
- 空值、非数字和不同精度的时长：仅比较有效非负数，始终保留数值较大的一侧；由任务 2 的时长合并表格测试覆盖。
- 排序中包含重复、陈旧或遗漏 ID：去重、移除不存在 ID，并将有效遗漏记录稳定追加；由任务 2 的排序测试覆盖。
- 连续导入同一个文件及下载资源释放：每次选择前清空 file input，下载点击后撤销 Object URL；由任务 3 的实现检查覆盖。

---

## 文件结构

- 修改 `src/shared/gameReviewStorage.ts`：增加自定义游戏的持久化类型与 load/save API，并导出测评规范化函数供备份解析复用。
- 修改 `src/shared/gameReviewStorage.test.ts`：覆盖自定义游戏持久化、损坏存储恢复和封面剔除。
- 创建 `src/shared/gameReviewBackup.ts`：定义版本化 JSON 格式，实现创建、解析、时长选择和导入合并纯函数。
- 创建 `src/shared/gameReviewBackup.test.ts`：覆盖格式、校验、冲突、时长与排序。
- 修改 `src/components/GameReview.vue`：初始化/保存自定义游戏，增加导入导出按钮、文件输入、状态提示及原子状态更新。

### Task 1: 持久化无封面的自定义游戏

**Files:**
- Modify: `src/shared/gameReviewStorage.ts`
- Modify: `src/shared/gameReviewStorage.test.ts`

**Interfaces:**
- Consumes: 现有 `GameReviewDraft`、`ReviewStorage` 和字段规范化规则。
- Produces:
  - `StoredCustomGame { appId: string; appName: string; review: GameReviewDraft }`
  - `normalizeGameReviewDraft(value: unknown): GameReviewDraft | null`
  - `loadStoredCustomGames(storage: ReviewStorage): StoredCustomGame[]`
  - `saveStoredCustomGames(storage: ReviewStorage, games: StoredCustomGame[]): void`

- [ ] **Step 1: 写自定义游戏持久化的失败测试**

在 `gameReviewStorage.test.ts` 的导入列表加入新 API，并加入以下用例：

```ts
it('保存并恢复不含封面的自定义游戏', () => {
  const storage = createStorage()
  const customGames: StoredCustomGame[] = [
    {
      appId: 'custom-1',
      appName: '自定义游戏',
      review: { ...review, appName: undefined } as never,
    },
  ]
  customGames[0].review = {
    type: ['卡牌'],
    experience: '自定义测评',
    duration: '12.5',
    rating: 4,
    recommendation: 'A',
    coverBlurred: true,
  }

  saveStoredCustomGames(storage, customGames)

  expect(loadStoredCustomGames(storage)).toEqual(customGames)
  expect(JSON.stringify([...storage.saved.values()])).not.toContain('coverUrl')
})
```

实现时将测试夹具写成合法的 `GameReviewDraft` 常量，避免保留上例中为压缩展示使用的临时类型断言。

再加入损坏数据用例：

```ts
it('忽略无效和重复的自定义游戏存储记录', () => {
  const storage = createStorage()
  storage.setItem(
    'steam-image-browser-game-review-custom-games',
    JSON.stringify({
      version: 1,
      games: [
        { appId: '', appName: '无效', review },
        { appId: 'custom-1', appName: '有效', review },
        { appId: 'custom-1', appName: '重复', review },
        null,
      ],
    }),
  )

  expect(loadStoredCustomGames(storage)).toEqual([
    { appId: 'custom-1', appName: '有效', review },
  ])
})
```

- [ ] **Step 2: 经用户明确同意后运行定向测试，确认 RED**

Run only after approval:

```bash
npm test -- src/shared/gameReviewStorage.test.ts
```

Expected: FAIL，因为 `StoredCustomGame`、`loadStoredCustomGames` 和 `saveStoredCustomGames` 尚不存在。

- [ ] **Step 3: 导出规范化函数并实现自定义游戏存储**

在 `gameReviewStorage.ts` 中：

```ts
export interface StoredCustomGame {
  appId: string
  appName: string
  review: GameReviewDraft
}

const CUSTOM_GAMES_STORAGE_KEY = 'steam-image-browser-game-review-custom-games'
const CUSTOM_GAMES_STORAGE_VERSION = 1

export function normalizeGameReviewDraft(value: unknown): GameReviewDraft | null {
  if (!isRecord(value)) return null

  return {
    type: Array.isArray(value.type)
      ? value.type.filter((item): item is string => typeof item === 'string')
      : [],
    experience: typeof value.experience === 'string' ? value.experience : '',
    duration: typeof value.duration === 'string' ? value.duration : '',
    rating:
      typeof value.rating === 'number' &&
      Number.isInteger(value.rating) &&
      value.rating >= 0 &&
      value.rating <= 5
        ? value.rating
        : 0,
    recommendation: typeof value.recommendation === 'string' ? value.recommendation : '',
    coverBlurred: value.coverBlurred === true,
  }
}
```

让现有 `normalizeReviews` 调用 `normalizeGameReviewDraft`。新增：

```ts
export function loadStoredCustomGames(storage: ReviewStorage): StoredCustomGame[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(CUSTOM_GAMES_STORAGE_KEY) ?? 'null')
    if (!isRecord(value) || value.version !== CUSTOM_GAMES_STORAGE_VERSION || !Array.isArray(value.games)) {
      return []
    }

    const seen = new Set<string>()
    return value.games.flatMap((item) => {
      if (!isRecord(item)) return []
      const appId = typeof item.appId === 'string' ? item.appId.trim() : ''
      const appName = typeof item.appName === 'string' ? item.appName : ''
      const review = normalizeGameReviewDraft(item.review)
      if (!appId.startsWith('custom-') || seen.has(appId) || !review) return []
      seen.add(appId)
      return [{ appId, appName, review }]
    })
  } catch {
    return []
  }
}

export function saveStoredCustomGames(
  storage: ReviewStorage,
  games: StoredCustomGame[],
): void {
  try {
    storage.setItem(
      CUSTOM_GAMES_STORAGE_KEY,
      JSON.stringify({
        version: CUSTOM_GAMES_STORAGE_VERSION,
        games: games.map((game) => ({
          appId: game.appId,
          appName: game.appName,
          review: { ...game.review, type: [...game.review.type] },
        })),
      }),
    )
  } catch {
    // localStorage may be unavailable or full; editing should continue in memory.
  }
}
```

`saveStoredCustomGames` 的输入类型没有 `coverUrl`，从类型边界上禁止封面进入存储。

- [ ] **Step 4: 经用户明确同意后运行定向测试，确认 GREEN**

```bash
npm test -- src/shared/gameReviewStorage.test.ts
```

Expected: PASS。

- [ ] **Step 5: 审查任务 1 的数据边界**

静态确认：

- 旧版 Steam 测评 load/save 行为未变；
- 自定义游戏存储键独立，不触发旧数据迁移；
- 自定义游戏类型不含 `coverUrl`；
- 重复或损坏的本地记录不会阻止应用启动。

不要提交；只有用户明确要求时才执行 Git commit。

### Task 2: 版本化备份解析与合并

**Files:**
- Create: `src/shared/gameReviewBackup.ts`
- Create: `src/shared/gameReviewBackup.test.ts`

**Interfaces:**
- Consumes:
  - `GameReviewDraft`、`StoredGameReview`、`StoredCustomGame`
  - `normalizeGameReviewDraft(value: unknown): GameReviewDraft | null`
- Produces:
  - `GameReviewBackupV1`
  - `GameReviewBackupState`
  - `GameReviewBackupError`，含 `code: 'unsupported' | 'invalid'`
  - `createGameReviewBackup(state, exportedAt?): GameReviewBackupV1`
  - `parseGameReviewBackup(value: unknown): GameReviewBackupV1`
  - `mergeGameReviewBackup(local, imported): GameReviewBackupState`

- [ ] **Step 1: 写备份创建与解析的失败测试**

创建 `gameReviewBackup.test.ts`，先覆盖合法往返和封面排除：

```ts
const draft: GameReviewDraft = {
  type: ['card'],
  experience: '值得重玩',
  duration: '42',
  rating: 5,
  recommendation: 'S',
  coverBlurred: false,
}

it('创建可解析且不含封面的版本 1 备份', () => {
  const backup = createGameReviewBackup(
    {
      reviews: { '10': { appName: 'Steam 游戏', ...draft } },
      customGames: [{ appId: 'custom-1', appName: '自定义游戏', review: draft }],
      order: ['custom-1', '10'],
    },
    '2026-09-28T12:00:00.000Z',
  )

  expect(parseGameReviewBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup)
  expect(JSON.stringify(backup)).not.toContain('coverUrl')
  expect(backup).toMatchObject({
    format: 'steam-pc-game-reviews',
    version: 1,
    exportedAt: '2026-09-28T12:00:00.000Z',
  })
})
```

- [ ] **Step 2: 写格式与身份冲突的失败测试**

```ts
it.each([
  null,
  {},
  { format: 'other-product', version: 1, reviews: {}, customGames: [], order: [] },
  { format: 'steam-pc-game-reviews', version: 2, reviews: {}, customGames: [], order: [] },
])('拒绝不受支持的备份 %#', (value) => {
  expect(() => parseGameReviewBackup(value)).toThrow(GameReviewBackupError)
})

it('拒绝重复自定义 ID 以及横跨 Steam 和自定义集合的 ID', () => {
  const base = createGameReviewBackup(
    { reviews: { '10': { appName: 'Steam', ...draft } }, customGames: [], order: ['10'] },
    '2026-09-28T12:00:00.000Z',
  )

  expect(() =>
    parseGameReviewBackup({
      ...base,
      customGames: [
        { appId: 'custom-1', appName: '一', review: draft },
        { appId: 'custom-1', appName: '二', review: draft },
      ],
    }),
  ).toThrow(GameReviewBackupError)

  expect(() =>
    parseGameReviewBackup({
      ...base,
      customGames: [{ appId: '10', appName: '冲突', review: draft }],
    }),
  ).toThrow(GameReviewBackupError)
})
```

- [ ] **Step 3: 写冲突字段、时长和排序的失败测试**

```ts
it.each([
  ['20', '30', '30'],
  ['40', '30', '40'],
  ['', '12.5', '12.5'],
  ['bad', '12.5', '12.5'],
  ['15', 'bad', '15'],
])('本地时长 %s 与导入时长 %s 合并为 %s', (localDuration, importedDuration, expected) => {
  const local = stateWithReview('10', { ...draft, duration: localDuration, experience: '本地' })
  const imported = backupWithReview('10', { ...draft, duration: importedDuration, experience: '导入' })

  const merged = mergeGameReviewBackup(local, imported)

  expect(merged.reviews['10'].duration).toBe(expected)
  expect(merged.reviews['10'].experience).toBe('导入')
})

it('导入排序优先并稳定追加本地及遗漏记录', () => {
  const merged = mergeGameReviewBackup(
    {
      reviews: {
        local: { appName: '本地', ...draft },
        shared: { appName: '共享本地', ...draft },
      },
      customGames: [],
      order: ['local', 'shared'],
    },
    createGameReviewBackup(
      {
        reviews: {
          shared: { appName: '共享导入', ...draft },
          imported: { appName: '导入', ...draft },
        },
        customGames: [],
        order: ['shared', 'shared', 'missing'],
      },
      '2026-09-28T12:00:00.000Z',
    ),
  )

  expect(merged.order).toEqual(['shared', 'local', 'imported'])
})
```

测试文件内实现 `stateWithReview` 和 `backupWithReview` 为小型夹具函数，返回上面接口定义的完整对象，不依赖 mock。

- [ ] **Step 4: 经用户明确同意后运行备份测试，确认 RED**

```bash
npm test -- src/shared/gameReviewBackup.test.ts
```

Expected: FAIL，因为备份模块尚不存在。

- [ ] **Step 5: 实现备份类型、创建和错误分类**

创建 `gameReviewBackup.ts`：

```ts
import {
  normalizeGameReviewDraft,
  type GameReviewDraft,
  type StoredCustomGame,
  type StoredGameReview,
} from './gameReviewStorage.js'

export const GAME_REVIEW_BACKUP_FORMAT = 'steam-pc-game-reviews'
export const GAME_REVIEW_BACKUP_VERSION = 1

export interface GameReviewBackupState {
  reviews: Record<string, StoredGameReview>
  customGames: StoredCustomGame[]
  order: string[]
}

export interface GameReviewBackupV1 extends GameReviewBackupState {
  format: typeof GAME_REVIEW_BACKUP_FORMAT
  version: typeof GAME_REVIEW_BACKUP_VERSION
  exportedAt: string
}

export class GameReviewBackupError extends Error {
  constructor(
    public readonly code: 'unsupported' | 'invalid',
    message: string,
  ) {
    super(message)
    this.name = 'GameReviewBackupError'
  }
}

export function createGameReviewBackup(
  state: GameReviewBackupState,
  exportedAt = new Date().toISOString(),
): GameReviewBackupV1 {
  return {
    format: GAME_REVIEW_BACKUP_FORMAT,
    version: GAME_REVIEW_BACKUP_VERSION,
    exportedAt,
    reviews: cloneReviews(state.reviews),
    customGames: state.customGames.map(cloneCustomGame),
    order: [...state.order],
  }
}
```

实现局部 `cloneReviews` 和 `cloneCustomGame`，深拷贝 `type`，且所有返回类型均不含封面字段。

- [ ] **Step 6: 实现严格外层解析和字段规范化**

实现以下规则：

```ts
export function parseGameReviewBackup(value: unknown): GameReviewBackupV1 {
  if (!isRecord(value) || value.format !== GAME_REVIEW_BACKUP_FORMAT) {
    throw new GameReviewBackupError('unsupported', '不是受支持的游戏测评备份')
  }
  if (value.version !== GAME_REVIEW_BACKUP_VERSION) {
    throw new GameReviewBackupError('unsupported', '不支持该游戏测评备份版本')
  }
  if (!isRecord(value.reviews) || !Array.isArray(value.customGames) || !Array.isArray(value.order)) {
    throw new GameReviewBackupError('invalid', '游戏测评备份结构无效')
  }

  // 逐项要求对象和非空 ID；字段值通过 normalizeGameReviewDraft 规范化。
  // 自定义 ID 必须以 custom- 开头，数组内不可重复，也不可与 reviews 的键冲突。
  // order 仅接受字符串；在解析阶段去重，但在合并阶段才过滤不存在 ID。
  // exportedAt 不是有效字符串时使用空字符串，因为它不参与数据合并。
}
```

使用模块内 `isRecord`，不要从存储模块暴露无关工具。Steam 记录的 `appName` 非字符串或为空时规范化为“未知游戏”；自定义名称非字符串时规范化为空字符串。

- [ ] **Step 7: 实现“时长取大”与确定性合并**

```ts
function durationValue(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function longerDuration(local: string, imported: string): string {
  const localValue = durationValue(local)
  const importedValue = durationValue(imported)
  if (localValue === null) return importedValue === null ? '' : imported
  if (importedValue === null) return local
  return importedValue > localValue ? imported : local
}

function mergeReview<T extends GameReviewDraft>(local: T | undefined, imported: T): T {
  if (!local) return { ...imported, type: [...imported.type] }
  return {
    ...imported,
    type: [...imported.type],
    duration: longerDuration(local.duration, imported.duration),
  }
}
```

`mergeGameReviewBackup` 必须：

1. 复制本地记录；
2. 逐项覆盖导入记录并调用 `mergeReview`；
3. 按 AppID 合并自定义游戏并调用同一时长规则；
4. 计算所有有效 ID；
5. 依次读取导入排序、本地排序、导入遗漏记录、本地遗漏记录；
6. 只追加有效且尚未出现的 ID。

- [ ] **Step 8: 经用户明确同意后运行备份测试，确认 GREEN**

```bash
npm test -- src/shared/gameReviewBackup.test.ts
```

Expected: PASS。

- [ ] **Step 9: 审查任务 2 的原子性和兼容性**

静态确认：

- `parseGameReviewBackup` 和 `mergeGameReviewBackup` 均为纯函数；
- 解析失败前后没有 localStorage 或 Vue 状态写入；
- 所有输出对象均为新对象，不复用输入的 `type` 数组；
- 备份结构不引用 Electron 类型或 API。

不要提交；只有用户明确要求时才执行 Git commit。

### Task 3: 接入游戏测评页面

**Files:**
- Modify: `src/components/GameReview.vue`

**Interfaces:**
- Consumes:
  - `loadStoredCustomGames` / `saveStoredCustomGames`
  - `createGameReviewBackup` / `parseGameReviewBackup` / `mergeGameReviewBackup`
  - `GameReviewBackupError`
- Produces: 页面上的“导入记录”“导出记录”、隐藏 JSON 文件输入、导入导出状态提示，以及导入后更新的测评/自定义游戏/排序状态。

- [ ] **Step 1: 将自定义游戏接入现有持久化生命周期**

更新导入，并在组件初始化时恢复自定义游戏：

```ts
const storedCustomGames = reactive<Record<string, StoredCustomGame>>(
  Object.fromEntries(loadStoredCustomGames(window.localStorage).map((game) => [game.appId, game])),
)
const customGames = ref<CustomReviewGame[]>(
  Object.values(storedCustomGames).map((game) => ({
    appId: game.appId,
    appName: game.appName,
    coverUrl: '',
    isCustom: true,
  })),
)
```

让 `newReviewDraft` 依次读取 `savedReviews[appId]` 和 `storedCustomGames[appId]?.review`。在 `snapshotGameReviews` 中：

```ts
if (isCustomGame(game)) {
  storedCustomGames[game.appId] = {
    appId: game.appId,
    appName: game.appName,
    review: { ...draft, type: [...draft.type] },
  }
  continue
}
```

`persistGameReviews` 同时调用：

```ts
saveGameReviews(window.localStorage, savedReviews)
saveStoredCustomGames(window.localStorage, Object.values(storedCustomGames))
```

删除自定义游戏时同步 `delete storedCustomGames[game.appId]`。增加对自定义游戏名称变化的深度监听：

```ts
watch(customGames, scheduleGameReviewSave, { deep: true })
```

- [ ] **Step 2: 增加记录传输状态与快照函数**

```ts
const recordFileInput = ref<HTMLInputElement | null>(null)
const isImportingRecords = ref(false)
const isExportingRecords = ref(false)
const recordTransferMessage = ref('')
const recordTransferError = ref('')

function currentBackupState(): GameReviewBackupState {
  persistGameReviews()
  return {
    reviews: Object.fromEntries(
      Object.entries(savedReviews).map(([appId, review]) => [
        appId,
        { ...review, type: [...review.type] },
      ]),
    ),
    customGames: Object.values(storedCustomGames).map((game) => ({
      appId: game.appId,
      appName: game.appName,
      review: { ...game.review, type: [...game.review.type] },
    })),
    order: [...gameOrder.value],
  }
}
```

导入和导出开始时清空旧成功/错误提示。不要复用图片导出的 `isExporting` 或 `exportError`，避免两种操作相互禁用或覆盖消息。

- [ ] **Step 3: 实现浏览器 JSON 下载**

```ts
function exportReviewRecords(): void {
  if (isExportingRecords.value) return
  isExportingRecords.value = true
  recordTransferMessage.value = ''
  recordTransferError.value = ''

  try {
    const backup = createGameReviewBackup(currentBackupState())
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `game-reviews-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    recordTransferMessage.value = '测评记录已导出'
  } catch (error) {
    recordTransferError.value = error instanceof Error ? error.message : '导出测评记录失败'
  } finally {
    isExportingRecords.value = false
  }
}
```

- [ ] **Step 4: 实现文件选择与无副作用解析**

```ts
function chooseReviewRecordFile(): void {
  if (isImportingRecords.value || !recordFileInput.value) return
  recordFileInput.value.value = ''
  recordFileInput.value.click()
}

async function importReviewRecords(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  isImportingRecords.value = true
  recordTransferMessage.value = ''
  recordTransferError.value = ''

  try {
    let raw: unknown
    try {
      raw = JSON.parse(await file.text())
    } catch {
      throw new Error('无法读取 JSON 文件')
    }

    const backup = parseGameReviewBackup(raw)
    const merged = mergeGameReviewBackup(currentBackupState(), backup)
    applyImportedReviewState(merged, new Set(backup.customGames.map((game) => game.appId)))
    recordTransferMessage.value = `已导入 ${Object.keys(backup.reviews).length + backup.customGames.length} 条测评记录`
  } catch (error) {
    recordTransferError.value =
      error instanceof GameReviewBackupError || error instanceof Error
        ? error.message
        : '导入测评记录失败'
  } finally {
    isImportingRecords.value = false
  }
}
```

解析和合并都必须在 `applyImportedReviewState` 前完成，保证坏文件不会造成局部更新。

- [ ] **Step 5: 原子应用合并状态**

实现局部工具：

```ts
function replaceReactiveRecord<T>(target: Record<string, T>, source: Record<string, T>): void {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, source)
}
```

`applyImportedReviewState` 执行：

```ts
function applyImportedReviewState(
  state: GameReviewBackupState,
  importedCustomIds: Set<string>,
): void {
  const existingCoverById = new Map(customGames.value.map((game) => [game.appId, game.coverUrl]))

  replaceReactiveRecord(savedReviews, state.reviews)
  replaceReactiveRecord(
    storedCustomGames,
    Object.fromEntries(state.customGames.map((game) => [game.appId, game])),
  )
  customGames.value = state.customGames.map((game) => ({
    appId: game.appId,
    appName: game.appName,
    coverUrl: importedCustomIds.has(game.appId) ? '' : existingCoverById.get(game.appId) ?? '',
    isCustom: true,
  }))

  const nextDrafts: Record<string, GameReviewDraft> = {}
  for (const [appId, review] of Object.entries(state.reviews)) {
    nextDrafts[appId] = { ...review, type: normalizeGameTypeIds(review.type) }
  }
  for (const game of state.customGames) {
    nextDrafts[game.appId] = { ...game.review, type: normalizeGameTypeIds(game.review.type) }
  }
  replaceReactiveRecord(drafts, nextDrafts)

  gameOrder.value = [...state.order]
  clearFilters()
  gameNameQuery.value = ''
  currentPage.value = 1
  persistGameReviews()
  saveGameReviewOrder(window.localStorage, gameOrder.value)
}
```

本地独有自定义游戏可保留当前会话封面；出现在导入文件中的自定义游戏封面必须清空。所有持久化形式都不包含封面。

- [ ] **Step 6: 添加始终可见的导入导出入口**

将记录按钮放在 `review-header`，确保没有任何测评时仍可导入：

```vue
<div class="record-actions">
  <button type="button" :disabled="isImportingRecords" @click="chooseReviewRecordFile">
    {{ isImportingRecords ? '导入中…' : '导入记录' }}
  </button>
  <button type="button" :disabled="isExportingRecords" @click="exportReviewRecords">
    {{ isExportingRecords ? '导出中…' : '导出记录' }}
  </button>
  <input
    ref="recordFileInput"
    class="visually-hidden"
    type="file"
    accept="application/json,.json"
    @change="importReviewRecords"
  />
</div>
<p v-if="recordTransferError" class="record-transfer-error" role="alert">
  {{ recordTransferError }}
</p>
<p v-else-if="recordTransferMessage" class="record-transfer-message" aria-live="polite">
  {{ recordTransferMessage }}
</p>
```

样式复用页面现有按钮色、圆角和焦点状态；`.record-actions` 使用 flex、12px 间距和顶部留白。不要改变现有“导出图片”按钮或表格布局。

- [ ] **Step 7: 静态检查完整状态流**

在不运行命令的前提下逐项核对：

- 空页面仍显示“导入记录”；
- 导出前调用 `persistGameReviews`，捕获尚未到 300ms 防抖保存的编辑；
- JSON 对象不从 `GameReviewItem` 复制 `coverUrl`；
- 文件解析失败发生在任何响应式赋值之前；
- 导入后自定义游戏进入 `storedCustomGames` 并保存；
- 重选同一文件时 input 已清空；
- Object URL 在点击后撤销；
- 图片导出状态与记录导入导出状态互不干扰。

- [ ] **Step 8: 仅在用户明确同意后执行最终验证**

建议命令，但不得自动运行：

```bash
npm test -- src/shared/gameReviewStorage.test.ts src/shared/gameReviewBackup.test.ts
npm run typecheck
```

如用户另外明确同意启动应用，再手动验证：导出 JSON、检查无封面字段、导入冲突记录、刷新页面确认自定义游戏恢复。

不要提交；只有用户明确要求时才执行 Git commit。
