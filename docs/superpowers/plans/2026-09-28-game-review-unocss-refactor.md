# 游戏测评页结构与 UnoCSS 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在严格保持游戏测评页视觉、交互、存储和导出行为的前提下，用类型化领域模块、三个 composable、四个展示组件和混合 UnoCSS 策略替代单体 `GameReview.vue`。

**Architecture:** `src/shared/gameReview.ts` 提供领域类型与纯函数，`gameReviewStorage.ts` 只处理持久化兼容；三个 composable 分别拥有草稿、自定义游戏、筛选分页和拖拽排序状态。`GameReview.vue` 组合这些能力并负责浮层与导出，展示组件只通过 typed props/emits 通信。普通静态样式迁到 UnoCSS utility，稳定复用组合进入 shortcuts，关系型和特殊效果样式保留 scoped CSS。

**Tech Stack:** Vue 3 Composition API、TypeScript strict mode、UnoCSS presetUno、Vitest、html-to-image、Electron preload bridge

**Spec:** `docs/superpowers/specs/2026-09-28-game-review-unocss-refactor-design.md`

## Global Constraints

- 第一阶段只重构游戏测评领域和 `GameReview` 页面，不修改 `App.vue` 或其他页面。
- 严格保持当前视觉数值、交互顺序、localStorage 键、Electron IPC 接口和图片导出结果。
- 保留工作区中尚未提交的封面模糊功能及 `coverBlurred` 存储字段。
- 普通静态样式使用 UnoCSS；复杂结构选择器、主题覆盖、特殊效果和导出规则保留 scoped CSS。
- 不新增运行时或测试依赖，不建立通用 UI 组件库，不创建笼统的 `utils.ts`。
- 遵循用户偏好：不得自动运行测试、类型检查或构建。计划列出的测试命令只在用户明确授权后执行；默认只编写测试并运行 `git diff --check`。
- 每次提交只包含当前任务文件，不夹带其他工作区改动。

## Review Focus

- **旧类型值和重复别名：** `黄油`、`养成经营`、`SLG养成`、`箱体地图`、稳定 ID 和重复值应归一化为唯一且顺序稳定的 `GameTypeId[]`；Task 2 覆盖。
- **未知持久化值：** 未知推荐等级、越界评分、无效 `coverBlurred` 和损坏 JSON 应回退到默认值，不污染运行时类型；Task 3 覆盖。
- **列表在交互中变化：** 删除游戏、筛选结果变化和页数减少时，不得留下越界页码或指向不存在 AppID 的菜单/拖拽状态；Tasks 5、6、9 覆盖。
- **拖拽边界：** 筛选开启、指针未超过阈值、取消事件和目标行消失时不得重排或误触发封面选择；Task 6 覆盖。
- **导出状态：** 封面模糊效果应进入导出图片，但模糊切换、删除按钮等 `data-export-ignore` 控件不得进入；Task 9 的结构核对覆盖。

---

## File Structure

### Create

- `src/composables/useGameReviewDrafts.ts` — 草稿、自定义游戏、保存和 Steam 时长补全。
- `src/composables/useGameReviewFilters.ts` — 搜索、筛选和分页状态。
- `src/composables/useGameReviewReorder.ts` — 顺序、指针拖拽和清理。
- `src/composables/useGameReviewFilters.test.ts` — 筛选与分页回归测试。
- `src/composables/useGameReviewReorder.test.ts` — 纯顺序计算回归测试。
- `src/components/game-review/GameReviewFilters.vue` — 筛选区域。
- `src/components/game-review/GameReviewPagination.vue` — 分页区域。
- `src/components/game-review/GameReviewRow.vue` — 单行编辑区域。
- `src/components/game-review/GameReviewTable.vue` — 表格与行编排。

### Modify

- `src/shared/gameReview.ts` — 增加领域类型、常量和纯函数。
- `src/shared/gameReview.test.ts` — 增加领域行为测试。
- `src/shared/gameReviewStorage.ts` — 使用收紧后的领域类型并归一化旧数据。
- `src/shared/gameReviewStorage.test.ts` — 覆盖迁移和无效数据。
- `src/components/GameReview.vue` — 缩减为页面协调层。
- `uno.config.ts` — 增加首批可复用 shortcuts。

### Preserve Unchanged

- `src/App.vue` 中 `GameReview` 的 `games` prop 和 `reorder` 事件调用方式。
- `src/env.d.ts` 中 Electron bridge 类型。
- localStorage 键 `steam-image-browser-game-review-drafts` 和 `steam-image-browser-game-review-order`。

---

### Task 1: 固化封面模糊功能基线

**Files:**
- Modify: `src/components/GameReview.vue`
- Modify: `src/shared/gameReviewStorage.ts`
- Test: `src/shared/gameReviewStorage.test.ts`

**Interfaces:**
- Consumes: 当前工作区已有的 `GameReviewDraft.coverBlurred: boolean`、模糊按钮和样式。
- Produces: 一个独立基线提交，供后续结构重构安全移动。

- [ ] **Step 1: 核对仅有预期的三个在途文件**

Run:

```bash
git status --short
git diff -- src/components/GameReview.vue src/shared/gameReviewStorage.ts src/shared/gameReviewStorage.test.ts
```

Expected: 仅显示封面模糊 UI、`coverBlurred` 字段和对应存储测试改动。

- [ ] **Step 2: 检查差异格式**

Run:

```bash
git diff --check
```

Expected: exit 0，无空白错误。

- [ ] **Step 3: 若用户授权，运行现有存储测试**

Run only with explicit authorization:

```bash
npm test -- src/shared/gameReviewStorage.test.ts
```

Expected: PASS，现有 6 个存储测试全部通过。

- [ ] **Step 4: 提交基线**

```bash
git add src/components/GameReview.vue src/shared/gameReviewStorage.ts src/shared/gameReviewStorage.test.ts
git commit -m "feat: 支持模糊游戏测评封面" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: 建立类型化游戏测评领域模型

**Files:**
- Modify: `src/shared/gameReview.ts`
- Modify: `src/shared/gameReview.test.ts`

**Interfaces:**
- Consumes: `ImageAsset`、现有 `GameReviewItem`。
- Produces:
  - `GAME_TYPES`
  - `GameTypeId`
  - `GAME_TYPE_OPTIONS`
  - `normalizeGameTypeIds(values: readonly unknown[]): GameTypeId[]`
  - `RECOMMENDATION_GRADES`
  - `RecommendationGrade`
  - `isRecommendationGrade(value: unknown): value is RecommendationGrade`
  - `GameReviewDraft`
  - `createEmptyGameReviewDraft(): GameReviewDraft`
  - `recommendationClass(grade: RecommendationGrade): RecommendationClass`
  - `normalizeDuration(value: string): string`
  - `durationClass(value: string): DurationClass`
  - `formatSteamPlaytime(minutes: number): string`

- [ ] **Step 1: 写领域行为测试**

在 `src/shared/gameReview.test.ts` 保留 `selectedGamesForReview` 测试，并加入：

```ts
import {
  createEmptyGameReviewDraft,
  durationClass,
  formatSteamPlaytime,
  normalizeDuration,
  normalizeGameTypeIds,
  recommendationClass,
} from './gameReview'

describe('game review domain', () => {
  it('将稳定 ID、显示名和旧别名归一化并去重', () => {
    expect(
      normalizeGameTypeIds(['card', '卡牌', '黄油', '养成经营', 'management', '箱体地图', 42]),
    ).toEqual(['card', 'butter', 'management', 'hakoniwa'])
  })

  it('忽略未知游戏类型', () => {
    expect(normalizeGameTypeIds(['不存在的类型'])).toEqual([])
  })

  it('创建互不共享数组的空草稿', () => {
    const first = createEmptyGameReviewDraft()
    const second = createEmptyGameReviewDraft()
    first.type.push('card')

    expect(second).toEqual({
      type: [],
      experience: '',
      duration: '',
      rating: 0,
      recommendation: '',
      coverBlurred: false,
    })
  })

  it.each([
    ['12小时', '12'],
    ['3.5h', '3.5'],
    ['1.2.3', '1.23'],
    ['abc', ''],
  ])('规范化时长输入 %s', (input, expected) => {
    expect(normalizeDuration(input)).toBe(expected)
  })

  it.each([
    ['', 'duration-default'],
    ['9.9', 'duration-green'],
    ['10', 'duration-blue'],
    ['30', 'duration-purple'],
    ['60', 'duration-orange'],
    ['99', 'duration-gold'],
    ['150', 'duration-rainbow'],
  ] as const)('将时长 %s 映射为 %s', (input, expected) => {
    expect(durationClass(input)).toBe(expected)
  })

  it('映射推荐等级并格式化 Steam 分钟数', () => {
    expect(recommendationClass('S+')).toBe('grade-s-plus')
    expect(recommendationClass('')).toBe('grade-empty')
    expect(formatSteamPlaytime(2011)).toBe('33.5')
  })
})
```

- [ ] **Step 2: 若用户授权，验证测试先失败**

Run only with explicit authorization:

```bash
npm test -- src/shared/gameReview.test.ts
```

Expected: FAIL，提示新增导出不存在。

- [ ] **Step 3: 实现领域常量和派生类型**

在 `src/shared/gameReview.ts` 中加入以下定义；保留 `selectedGamesForReview`：

```ts
export interface GameTypeDefinition {
  label: string
  color: string
  aliases?: readonly string[]
}

export const GAME_TYPES = {
  butter: { label: '🧈', color: '#ffcfdf', aliases: ['黄油'] },
  galgame: { label: 'Galgame', color: '#f472b6' },
  horror: { label: '恐怖游戏', color: '#dc2626' },
  rpg: { label: 'RPG', color: '#8b5cf6' },
  jrpg: { label: 'JRPG', color: '#ec4899' },
  soulslike: { label: '类魂', color: '#222831' },
  roguelike: { label: '肉鸽', color: '#c084fc' },
  card: { label: '卡牌', color: '#fbbf24' },
  management: { label: '建造经营', color: '#9896f1', aliases: ['养成经营'] },
  slg: { label: 'SLG', color: '#ff165d', aliases: ['SLG养成'] },
  towerDefense: { label: '塔防', color: '#6639a6' },
  casual: { label: '休闲', color: '#a5dee5' },
  puzzle: { label: '解谜', color: '#60a5fa' },
  metroidvania: { label: '类银河恶魔城', color: '#a8e6cf' },
  bulletHell: { label: '弹幕', color: '#ffd3b6' },
  sideScroller: { label: '横版闯关', color: '#f87171' },
  platformer: { label: '平台跳跃', color: '#67e8f9' },
  openWorld: { label: '开放世界', color: '#5eead4' },
  hakoniwa: { label: '箱庭地图', color: '#ff9a8b', aliases: ['箱体地图'] },
  multiplayer: { label: '联机', color: '#86efac' },
  sokoban: { label: '推箱子', color: '#d6b978' },
  action: { label: '动作游戏', color: '#112d4e' },
  shooter: { label: '射击游戏', color: '#38bdf8' },
  meta: { label: 'Meta', color: '#f59e0b' },
  turnBased: { label: '回合制', color: '#14b8a6' },
  visualNovel: { label: '视觉小说', color: '#fc5185' },
} as const satisfies Record<string, GameTypeDefinition>

export type GameTypeId = keyof typeof GAME_TYPES
export const GAME_TYPE_OPTIONS = Object.entries(GAME_TYPES).map(([id, definition]) => ({
  id: id as GameTypeId,
  ...definition,
}))

export const RECOMMENDATION_GRADES = ['', 'C', 'C+', 'B', 'B+', 'A', 'A+', 'S', 'S+'] as const
export type RecommendationGrade = (typeof RECOMMENDATION_GRADES)[number]
export type RecommendationClass =
  | 'grade-empty' | 'grade-c' | 'grade-c-plus' | 'grade-b' | 'grade-b-plus'
  | 'grade-a' | 'grade-a-plus' | 'grade-s' | 'grade-s-plus'
export type DurationClass =
  | 'duration-default' | 'duration-green' | 'duration-blue' | 'duration-purple'
  | 'duration-orange' | 'duration-gold' | 'duration-rainbow'

export interface GameReviewDraft {
  type: GameTypeId[]
  experience: string
  duration: string
  rating: number
  recommendation: RecommendationGrade
  coverBlurred: boolean
}
```

实现别名 Map、类型守卫、默认草稿、推荐等级 class、时长规范化和格式化。函数必须返回上面声明的窄类型，不使用 `as any`。

- [ ] **Step 4: 若用户授权，验证领域测试通过**

Run only with explicit authorization:

```bash
npm test -- src/shared/gameReview.test.ts
```

Expected: PASS，原有选择逻辑和新增领域测试全部通过。

- [ ] **Step 5: 检查并提交**

```bash
git diff --check
git add src/shared/gameReview.ts src/shared/gameReview.test.ts
git commit -m "refactor: 提取游戏测评领域模型" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: 收紧存储层类型并兼容旧数据

**Files:**
- Modify: `src/shared/gameReviewStorage.ts`
- Modify: `src/shared/gameReviewStorage.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `GameReviewDraft`、`normalizeGameTypeIds`、`isRecommendationGrade`。
- Produces: `StoredGameReview extends GameReviewDraft`；所有读取结果只含稳定类型 ID 和有效推荐等级。

- [ ] **Step 1: 更新存储测试的稳定 ID 预期**

把测试夹具中的显示名称改成稳定 ID，并加入旧值迁移与未知推荐度用例：

```ts
const review: StoredGameReview = {
  appName: '示例游戏',
  type: ['card'],
  experience: '值得反复游玩',
  duration: '42',
  rating: 5,
  recommendation: 'S',
  coverBlurred: false,
}

it('将旧类型名称迁移为稳定 ID 并去重', () => {
  const storage = createStorage(JSON.stringify({
    version: 2,
    reviews: {
      '10': { ...review, type: ['卡牌', 'card', '养成经营', 'unknown'] },
    },
  }))

  expect(loadGameReviews(storage)['10'].type).toEqual(['card', 'management'])
})

it('拒绝未知推荐等级', () => {
  const storage = createStorage(JSON.stringify({
    version: 2,
    reviews: { '10': { ...review, recommendation: 'SSS' } },
  }))

  expect(loadGameReviews(storage)['10'].recommendation).toBe('')
})
```

现有无效字段测试中的类型预期改为 `['card']`。

- [ ] **Step 2: 若用户授权，验证测试先失败**

Run only with explicit authorization:

```bash
npm test -- src/shared/gameReviewStorage.test.ts
```

Expected: FAIL，旧标签尚未转换为稳定 ID，未知推荐等级仍被保留。

- [ ] **Step 3: 让存储层复用领域归一化**

删除 `gameReviewStorage.ts` 内的 `GameReviewDraft` 定义，改为：

```ts
import {
  createEmptyGameReviewDraft,
  isRecommendationGrade,
  normalizeGameTypeIds,
  type GameReviewDraft,
  type GameReviewItem,
} from './gameReview.js'
export type { GameReviewDraft } from './gameReview.js'
```

`normalizeDraft` 先创建默认草稿，再覆盖合法字段：

```ts
function normalizeDraft(value: unknown): GameReviewDraft | null {
  if (!isRecord(value)) return null
  const fallback = createEmptyGameReviewDraft()

  return {
    type: normalizeGameTypeIds(Array.isArray(value.type) ? value.type : []),
    experience: typeof value.experience === 'string' ? value.experience : fallback.experience,
    duration: typeof value.duration === 'string' ? value.duration : fallback.duration,
    rating:
      typeof value.rating === 'number' && Number.isInteger(value.rating) &&
      value.rating >= 0 && value.rating <= 5
        ? value.rating
        : fallback.rating,
    recommendation: isRecommendationGrade(value.recommendation)
      ? value.recommendation
      : fallback.recommendation,
    coverBlurred: value.coverBlurred === true,
  }
}
```

- [ ] **Step 4: 若用户授权，验证存储测试通过**

Run only with explicit authorization:

```bash
npm test -- src/shared/gameReviewStorage.test.ts
```

Expected: PASS，版本 1、版本 2、损坏数据、类型别名和 `coverBlurred` 均符合预期。

- [ ] **Step 5: 检查并提交**

```bash
git diff --check
git add src/shared/gameReviewStorage.ts src/shared/gameReviewStorage.test.ts
git commit -m "refactor: 统一游戏测评存储类型" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: 抽取草稿与自定义游戏 composable

**Files:**
- Create: `src/composables/useGameReviewDrafts.ts`
- Modify: `src/components/GameReview.vue`

**Interfaces:**
- Consumes:
  - `sourceGames: Readonly<Ref<GameReviewItem[]>>`
  - `onRemoveSourceGame: (appId: string) => void`
  - 默认依赖 `window.localStorage`、`pickLocalImages`、`window.imageLibrary.fetchOwnedGames`
- Produces:

```ts
export interface CustomReviewGame extends GameReviewItem { isCustom: true }
export type ReviewGame = GameReviewItem | CustomReviewGame

export interface GameReviewDraftDependencies {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  pickImages: (options: { multiple: false }) => Promise<string[]>
  fetchOwnedGames: (force?: boolean) => Promise<OwnedGamesResult>
}

export function useGameReviewDrafts(
  sourceGames: Readonly<Ref<GameReviewItem[]>>,
  onRemoveSourceGame: (appId: string) => void,
  dependencies?: GameReviewDraftDependencies,
): {
  availableGames: ComputedRef<ReviewGame[]>
  drafts: Record<string, GameReviewDraft>
  addCustomGame(): string
  chooseCustomCover(appId: string): Promise<void>
  removeGame(game: ReviewGame): void
  isCustomGame(game: ReviewGame): game is CustomReviewGame
  persistGameReviews(): void
}
```

- [ ] **Step 1: 创建 composable 并移动状态所有权**

移动以下现有逻辑，不改变行为：

- `savedReviews`、`customGames`、`customGameSequence`、`drafts`。
- `newReviewDraft`，改用 `createEmptyGameReviewDraft`。
- `addCustomGame`、`chooseCustomCover`、`removeGame`、`isCustomGame`。
- 草稿初始化 watcher。
- `fillSteamPlaytime`、保存 debounce、`beforeunload` 和卸载清理。

使用 `computed` 合并 `mergeGamesWithStoredReviews(sourceGames.value, savedReviews)` 与自定义游戏。删除已由 Task 2 提供的 `formatSteamPlaytime` 和类型规范化重复实现。

- [ ] **Step 2: 在页面接入 composable**

在 `GameReview.vue` 中：

```ts
const sourceGames = toRef(props, 'games')
const {
  availableGames,
  drafts,
  addCustomGame,
  chooseCustomCover,
  removeGame,
  isCustomGame,
} = useGameReviewDrafts(sourceGames, (appId) => {
  emit('reorder', props.games.filter((game) => game.appId !== appId))
})
```

保留页面调用名称，避免模板在此任务中发生大规模变化。`addCustomGame` 后跳到末页的页面协调动作继续由页面执行：composable 返回 AppID，页面清筛选并 `nextTick` 更新页码。

- [ ] **Step 3: 检查所有副作用只有一个所有者**

确认：

- 页面不再直接读写测评 localStorage。
- 页面不再注册 `beforeunload` 草稿监听。
- composable 卸载时清理保存 timer 和事件监听。
- 自定义游戏仍不写入历史测评列表。

- [ ] **Step 4: 若用户授权，运行相关单元测试**

Run only with explicit authorization:

```bash
npm test -- src/shared/gameReview.test.ts src/shared/gameReviewStorage.test.ts
```

Expected: PASS。

- [ ] **Step 5: 检查并提交**

```bash
git diff --check
git add src/composables/useGameReviewDrafts.ts src/components/GameReview.vue
git commit -m "refactor: 抽取游戏测评草稿状态" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: 抽取筛选与分页 composable

**Files:**
- Create: `src/composables/useGameReviewFilters.ts`
- Create: `src/composables/useGameReviewFilters.test.ts`
- Modify: `src/components/GameReview.vue`

**Interfaces:**
- Consumes:
  - `games: Readonly<Ref<ReviewGame[]>>`
  - `drafts: Readonly<Record<string, GameReviewDraft>>`
- Produces:

```ts
export interface GameReviewFilters {
  selectedTypeFilters: Ref<GameTypeId[]>
  selectedRecommendationFilters: Ref<RecommendationGrade[]>
  gameNameQuery: Ref<string>
  pageSize: Ref<number>
  currentPage: Ref<number>
  filteredGames: ComputedRef<ReviewGame[]>
  paginatedGames: ComputedRef<ReviewGame[]>
  totalPages: ComputedRef<number>
  visibleRangeStart: ComputedRef<number>
  visibleRangeEnd: ComputedRef<number>
  hasActiveFilters: ComputedRef<boolean>
  toggleTypeFilter(type: GameTypeId): void
  toggleRecommendationFilter(grade: RecommendationGrade): void
  clearFilters(): void
}

export function filterReviewGames(
  games: readonly ReviewGame[],
  drafts: Readonly<Record<string, GameReviewDraft>>,
  query: string,
  typeFilters: readonly GameTypeId[],
  recommendationFilters: readonly RecommendationGrade[],
): ReviewGame[]
```

- [ ] **Step 1: 写筛选纯函数测试**

```ts
import { describe, expect, it } from 'vitest'
import { filterReviewGames } from './useGameReviewFilters'

const games = [
  { appId: '10', appName: 'Card Quest', coverUrl: '' },
  { appId: '20', appName: 'Puzzle World', coverUrl: '' },
]
const drafts = {
  '10': { type: ['card'], experience: '', duration: '', rating: 0, recommendation: 'S', coverBlurred: false },
  '20': { type: ['puzzle'], experience: '', duration: '', rating: 0, recommendation: 'A', coverBlurred: false },
} as const

describe('filterReviewGames', () => {
  it('组合名称、类型和推荐度筛选', () => {
    expect(filterReviewGames(games, drafts, 'card', ['card'], ['S'])).toEqual([games[0]])
  })

  it('忽略缺少草稿的游戏', () => {
    expect(filterReviewGames(games, {}, '', [], [])).toEqual([])
  })

  it('空筛选返回所有具有草稿的游戏', () => {
    expect(filterReviewGames(games, drafts, '', [], [])).toEqual(games)
  })
})
```

- [ ] **Step 2: 若用户授权，验证测试先失败**

Run only with explicit authorization:

```bash
npm test -- src/composables/useGameReviewFilters.test.ts
```

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现纯筛选和响应式分页**

迁移页面中 `selectedTypeFilters` 到 `watch(filteredGames, ...)` 的相关逻辑。确保：

- 名称比较继续使用 `trim().toLocaleLowerCase()`。
- 任一筛选变化后页码回到 1。
- `pageSize` 变化后页码回到 1。
- 总页数减少后当前页收缩到合法范围。
- `clearFilters` 只清空类型和推荐度筛选，严格保留现有名称查询行为。

- [ ] **Step 4: 在页面替换原筛选状态**

页面只解构 composable 返回值。菜单关闭逻辑留在页面，以便筛选后关闭指向不可见游戏的浮层。

- [ ] **Step 5: 若用户授权，验证筛选测试通过**

Run only with explicit authorization:

```bash
npm test -- src/composables/useGameReviewFilters.test.ts
```

Expected: PASS。

- [ ] **Step 6: 检查并提交**

```bash
git diff --check
git add src/composables/useGameReviewFilters.ts src/composables/useGameReviewFilters.test.ts src/components/GameReview.vue
git commit -m "refactor: 抽取游戏测评筛选分页" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: 抽取排序和指针拖拽 composable

**Files:**
- Create: `src/composables/useGameReviewReorder.ts`
- Create: `src/composables/useGameReviewReorder.test.ts`
- Modify: `src/components/GameReview.vue`

**Interfaces:**
- Consumes:
  - `games: Readonly<Ref<ReviewGame[]>>`
  - `disabled: Readonly<Ref<boolean>>`
  - `onReorder: (orderedIds: string[]) => void`
  - 默认依赖 `window`、`document` 和 localStorage
- Produces:

```ts
export type DropPosition = 'before' | 'after'
export interface DropTarget { appId: string; position: DropPosition }

export function reorderGameIds(
  ids: readonly string[],
  movedId: string,
  target: DropTarget,
): string[]

export function useGameReviewReorder(...): {
  orderedGames: ComputedRef<ReviewGame[]>
  draggedAppId: Ref<string | null>
  dropTarget: Ref<DropTarget | null>
  beginCoverDrag(appId: string, event: PointerEvent): void
  handleCustomCoverClick(appId: string, chooseCover: () => void): void
}
```

- [ ] **Step 1: 写纯重排测试**

```ts
import { describe, expect, it } from 'vitest'
import { reorderGameIds } from './useGameReviewReorder'

describe('reorderGameIds', () => {
  it('将项目移动到目标之前和之后', () => {
    expect(reorderGameIds(['a', 'b', 'c'], 'a', { appId: 'c', position: 'before' }))
      .toEqual(['b', 'a', 'c'])
    expect(reorderGameIds(['a', 'b', 'c'], 'a', { appId: 'c', position: 'after' }))
      .toEqual(['b', 'c', 'a'])
  })

  it('源或目标不存在时返回原顺序副本', () => {
    expect(reorderGameIds(['a', 'b'], 'x', { appId: 'b', position: 'after' }))
      .toEqual(['a', 'b'])
    expect(reorderGameIds(['a', 'b'], 'a', { appId: 'x', position: 'after' }))
      .toEqual(['a', 'b'])
  })

  it('不会产生重复 ID', () => {
    expect(reorderGameIds(['a', 'b', 'c'], 'b', { appId: 'b', position: 'after' }))
      .toEqual(['a', 'b', 'c'])
  })
})
```

- [ ] **Step 2: 若用户授权，验证测试先失败**

Run only with explicit authorization:

```bash
npm test -- src/composables/useGameReviewReorder.test.ts
```

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现排序与拖拽生命周期**

移动 `gameOrder`、`PendingDrag`、拖拽 refs、事件处理和卸载清理。`reorderGameIds` 必须是无 DOM 依赖的纯函数。composable 应在这些情况下清理状态：

- `pointerup` 或 `pointercancel`。
- 当前游戏列表不再包含 dragged 或 target AppID。
- `disabled` 变为 true。
- 组件卸载。

拖拽阈值保持 8px，目标位置仍按行中点判断。

- [ ] **Step 4: 页面接入并映射源游戏顺序**

`onReorder` 接收完整 ID 顺序，页面只把 `props.games` 中存在的项目映射后发出原 `reorder` 事件。筛选开启时传入 `hasActiveFilters`，保持禁止排序。

- [ ] **Step 5: 若用户授权，验证重排测试通过**

Run only with explicit authorization:

```bash
npm test -- src/composables/useGameReviewReorder.test.ts
```

Expected: PASS。

- [ ] **Step 6: 检查并提交**

```bash
git diff --check
git add src/composables/useGameReviewReorder.ts src/composables/useGameReviewReorder.test.ts src/components/GameReview.vue
git commit -m "refactor: 抽取游戏测评拖拽排序" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: 建立 UnoCSS 基础 shortcuts 与轻量组件

**Files:**
- Modify: `uno.config.ts`
- Create: `src/components/game-review/GameReviewFilters.vue`
- Create: `src/components/game-review/GameReviewPagination.vue`
- Modify: `src/components/GameReview.vue`

**Interfaces:**
- Consumes: Task 2 的 `GAME_TYPE_OPTIONS`、`RECOMMENDATION_GRADES`、`recommendationClass`；Task 5 的 refs 与统计值。
- Produces:
  - `GameReviewFilters` typed props/emits。
  - `GameReviewPagination` typed props/emits。
  - `ui-panel`、`ui-button`、`ui-input`、`ui-empty-state`、`ui-focus-ring` shortcuts。

- [ ] **Step 1: 定义严格等价的 shortcuts**

在 `uno.config.ts` 中扩展：

```ts
export default defineConfig({
  presets: [presetUno()],
  shortcuts: {
    'ui-panel': 'border border-[var(--border)] bg-[var(--panel-background)] shadow-[var(--shadow-panel)]',
    'ui-button': 'border border-[var(--border-strong)] rounded-[9px] bg-[var(--accent-hover)] text-[var(--text-bright)] font-inherit font-800 cursor-pointer',
    'ui-input': 'min-w-0 border border-[var(--border-soft)] bg-[var(--input-background)] text-[var(--text-bright)] font-inherit outline-none',
    'ui-empty-state': 'border border-dashed border-[var(--border-strong)] rounded-[20px] bg-[var(--panel-background-soft)] text-center text-[var(--text-muted)]',
    'ui-focus-ring': 'focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-2',
  },
})
```

若 UnoCSS 对某个 shorthand 生成值与当前 CSS 不等价，使用 bracket arbitrary value，而不是改变视觉值。

- [ ] **Step 2: 创建筛选组件**

Props：

```ts
const props = defineProps<{
  gameNameQuery: string
  selectedTypeFilters: readonly GameTypeId[]
  selectedRecommendationFilters: readonly RecommendationGrade[]
  filteredCount: number
  totalCount: number
  hasActiveFilters: boolean
}>()

const emit = defineEmits<{
  'update:gameNameQuery': [value: string]
  'toggle-type': [type: GameTypeId]
  'toggle-recommendation': [grade: RecommendationGrade]
  clear: []
}>()
```

把原筛选模板移入组件。布局、间距、尺寸、基础字体和简单状态改用 utility；仅 `grid-template-areas` 和 980px 区域重排保留 scoped CSS。

- [ ] **Step 3: 创建分页组件**

Props/emits：

```ts
const props = defineProps<{
  currentPage: number
  totalPages: number
  pageSize: number
  pageSizeOptions: readonly number[]
  visibleRangeStart: number
  visibleRangeEnd: number
  totalItems: number
}>()
const emit = defineEmits<{
  'update:currentPage': [value: number]
  'update:pageSize': [value: number]
}>()
```

模板全部使用 utility 和共享 shortcuts；不要保留仅表达普通布局的 scoped CSS。

- [ ] **Step 4: 页面接入两个组件**

用 `v-model:game-name-query`、`v-model:current-page`、`v-model:page-size` 和语义事件替换原模板区域。删除页面中已经迁走的对应 CSS。

- [ ] **Step 5: 核对生成 class 可静态扫描**

禁止动态拼接 utility class，例如 `` `text-${color}` ``。颜色继续通过静态 class 映射或 `:style` 使用领域定义中的 hex 值。

- [ ] **Step 6: 检查并提交**

```bash
git diff --check
git add uno.config.ts src/components/game-review/GameReviewFilters.vue src/components/game-review/GameReviewPagination.vue src/components/GameReview.vue
git commit -m "refactor: 用 UnoCSS 重构测评筛选分页" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: 拆分测评行与表格

**Files:**
- Create: `src/components/game-review/GameReviewRow.vue`
- Create: `src/components/game-review/GameReviewTable.vue`
- Modify: `src/components/GameReview.vue`

**Interfaces:**
- Consumes: `ReviewGame`、`GameReviewDraft`、游戏类型与推荐等级定义、拖拽状态。
- Produces:

`GameReviewRow.vue` props：

```ts
const props = defineProps<{
  game: ReviewGame
  draft: GameReviewDraft
  filtersActive: boolean
  isDragging: boolean
  dropPosition: DropPosition | null
  hoveredRating: number | null
  badgeStyle: ReviewBadgeStyle
}>()
```

`GameReviewRow.vue` emits：

```ts
const emit = defineEmits<{
  'update:game-name': [value: string]
  'choose-cover': []
  'toggle-cover-blur': []
  remove: []
  'cover-pointerdown': [event: PointerEvent]
  'open-type-menu': [event: MouseEvent]
  'update-experience': [value: string]
  'update-duration': [value: string]
  'update-rating': [value: number]
  'hover-rating': [value: number | null]
  'toggle-badge': []
  'open-recommendation-menu': [event: MouseEvent]
}>()
```

`GameReviewTable.vue` 接收行数组和 keyed 状态，并将行事件增加 `appId` 后上抛。页面仍拥有浮层与导出 ref。

- [ ] **Step 1: 创建 `GameReviewRow.vue`**

移动单个 `<tr>` 内容、textarea 自适应 directive、时长输入光标保持和徽章 SVG。不要直接修改 prop 对象；所有编辑都发出新值。

将普通静态样式迁到 utility，包括封面容器、输入布局、按钮基础样式、星级布局。保留以下 scoped CSS：

- `.cover-wrapper:hover .cover-blur-toggle` 显隐关系。
- `.game-name-cell:hover/.focus-within` 删除按钮关系。
- 最大评分星级特殊阴影。
- 时长颜色、彩虹文字。
- 皇冠与印章 SVG 样式及浅色主题覆盖。
- 拖拽行和 drop 边界类。

封面 `<img>` 保留 `cover-image` 和 `is-blurred` 关系类；模糊按钮保留 `data-export-ignore="true"`。

- [ ] **Step 2: 创建 `GameReviewTable.vue`**

移动 `<table>`、列宽和 `v-for`。表格内部以 `const exportElement = ref<HTMLElement | null>(null)` 指向导出容器，并明确暴露方法：

```ts
function getExportElement(): HTMLElement | null {
  return exportElement.value
}

defineExpose({ getExportElement })
```

页面使用 `ref<InstanceType<typeof GameReviewTable> | null>` 保存组件实例，并通过 `tableRef.value?.getExportElement()` 取得导出节点；禁止 `querySelector` 查找组件内部私有结构。

保留 scoped CSS：

- 首尾表头和单元格圆角。
- 行交替背景。
- 顶级评分行跨单元格效果。
- 表格边框消除规则。

其余宽度、基础边框、padding、字体和 overflow 转为 utility。

- [ ] **Step 3: 在表格层转发 typed events**

事件必须携带 `appId`：

```ts
const emit = defineEmits<{
  'update:game-name': [appId: string, value: string]
  'choose-cover': [appId: string]
  'toggle-cover-blur': [appId: string]
  remove: [game: ReviewGame]
  'cover-pointerdown': [appId: string, event: PointerEvent]
  'open-type-menu': [appId: string, event: MouseEvent]
  'update-experience': [appId: string, value: string]
  'update-duration': [appId: string, value: string]
  'update-rating': [appId: string, value: number]
  'hover-rating': [appId: string, value: number | null]
  'toggle-badge': [appId: string]
  'open-recommendation-menu': [appId: string, event: MouseEvent]
}>()
```

- [ ] **Step 4: 页面接入表格组件**

页面事件处理只做状态编排，例如：

```ts
function updateDraft<K extends keyof GameReviewDraft>(
  appId: string,
  key: K,
  value: GameReviewDraft[K],
): void {
  const draft = drafts[appId]
  if (draft) draft[key] = value
}
```

避免每种字段重复直接索引。对于自定义游戏名，调用 composable 暴露的 `renameCustomGame(appId, value)`，不在页面扫描内部数组。

- [ ] **Step 5: 核对导出 DOM 与控制项**

确认导出 ref 包含完整 table，且以下元素继续被排除：

- 无封面时的上传按钮。
- 封面模糊切换按钮。
- 删除按钮。

封面图片本身的 `is-blurred` class 必须留在导出 DOM 中。

- [ ] **Step 6: 检查并提交**

```bash
git diff --check
git add src/components/game-review/GameReviewRow.vue src/components/game-review/GameReviewTable.vue src/components/GameReview.vue
git commit -m "refactor: 拆分游戏测评表格组件" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: 精简页面协调层并完成 UnoCSS 迁移

**Files:**
- Modify: `src/components/GameReview.vue`
- Modify: `src/components/game-review/GameReviewFilters.vue`
- Modify: `src/components/game-review/GameReviewPagination.vue`
- Modify: `src/components/game-review/GameReviewRow.vue`
- Modify: `src/components/game-review/GameReviewTable.vue`
- Modify: `uno.config.ts`

**Interfaces:**
- Consumes: Tasks 2–8 的领域 API、composables 和组件事件。
- Produces: 保持原 `defineProps<{ games: GameReviewItem[] }>()` 与 `defineEmits<{ reorder: [games: GameReviewItem[]] }>()` 的精简页面。

- [ ] **Step 1: 删除页面中的重复实现**

`GameReview.vue` 不再定义：

- 游戏类型字典、别名 Map 和推荐等级 class Map。
- 时长解析与 Steam 时长格式化。
- 草稿保存、筛选分页和拖拽内部状态。
- 单行 textarea directive 和行内编辑细节。

页面保留：

- props/emits。
- composable 组合。
- 两个浮层的定位和互斥。
- 徽章样式选择状态。
- `waitForExportAssets` 与 `exportTable`。
- 筛选后关闭不可见浮层。

- [ ] **Step 2: 迁移页面壳层静态样式**

把页面壳、header、content、actions、空状态、添加按钮和 table scroll 的普通样式迁到 utility/shortcuts。例如：

```vue
<main class="min-h-screen bg-[var(--page-background)] p-10 max-[720px]:p-6">
  <section class="ui-panel mx-auto max-w-[1180px] rounded-6 p-8 max-[720px]:p-6">
```

数值必须与原 CSS 等价。不要为了使用 UnoCSS 把 `40px` 改成不等价 token；必要时使用 `p-[40px]`。

- [ ] **Step 3: 清理 scoped CSS**

逐条删除已由 utility 或 shortcut 覆盖的规则。每个保留规则必须属于以下类别之一：

1. 结构选择器。
2. 父子状态关系。
3. 伪元素或复杂动画。
4. 主题覆盖。
5. 导出特例。
6. 特殊渐变、阴影或 SVG 绘制。
7. 响应式 grid-area 重排。

不得保留只含 `display`、`gap`、`padding`、普通颜色或普通字体的单一语义类。

- [ ] **Step 4: 逐项静态核对行为**

检查模板和调用链：

- 无游戏时可添加自定义游戏。
- 新自定义游戏创建后清除全部筛选并跳至末页。
- 类型和推荐度浮层互斥，筛选后目标消失则关闭。
- 删除源游戏仍发出 `reorder`，删除自定义游戏不影响源列表。
- 拖拽筛选期间禁用，完成后保存完整顺序。
- `coverBlurred` 编辑、保存、恢复和导出保持有效。
- `exportTable` 仍等待字体和图片，使用 3 倍像素比和 48px 右侧余量。

- [ ] **Step 5: 若用户授权，运行完整测试和类型检查**

Run only with explicit authorization:

```bash
npm test
npm run typecheck
```

Expected: 全部测试 PASS；TypeScript 和 Vue 模板检查 exit 0。

- [ ] **Step 6: 默认执行差异验证**

```bash
git diff --check
git status --short
git diff --stat
```

Expected: 无空白错误；只包含本计划列出的文件。

- [ ] **Step 7: 提交页面整合**

```bash
git add uno.config.ts src/components/GameReview.vue src/components/game-review src/composables src/shared/gameReview.ts src/shared/gameReview.test.ts src/shared/gameReviewStorage.ts src/shared/gameReviewStorage.test.ts
git commit -m "refactor: 重构游戏测评页结构与样式" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: 第一阶段最终审查

**Files:**
- Review: 本计划创建和修改的全部文件
- Compare: `docs/superpowers/specs/2026-09-28-game-review-unocss-refactor-design.md`

**Interfaces:**
- Consumes: 第一阶段全部提交。
- Produces: 一份明确列出已满足项、未验证项和后续风险的审查结果；不扩大实现范围。

- [ ] **Step 1: 按规范逐项检查范围**

确认没有修改 `App.vue` 和其他页面，没有新增依赖，没有改变 localStorage 键或 Electron IPC。

- [ ] **Step 2: 检查类型边界**

搜索并审查以下残留：

```bash
rg "type: string\[\]|recommendation: string|Record<string, string>|as any|utils\.ts" src/shared src/composables src/components/GameReview.vue src/components/game-review
```

Expected: 不再以宽泛 `string` 表示游戏类型和推荐等级；没有 `as any`；没有新建笼统工具文件。合法的 CSS style object `Record<string, string>` 可保留，但需逐项说明。

- [ ] **Step 3: 检查 UnoCSS 边界**

确认：

- 普通静态样式已迁移。
- shortcuts 至少有两个实际调用方或明确为后续页面通用模式。
- 没有动态拼接 UnoCSS class。
- 保留 CSS 均属于规范允许类别。
- scoped 子组件样式没有依赖父组件的 scope attribute 穿透。

- [ ] **Step 4: 若用户授权，运行最终验证**

Run only with explicit authorization:

```bash
npm test
npm run typecheck
npm run build
```

Expected: 三条命令均 exit 0。若未授权，报告为“未运行”，不得声称通过。

- [ ] **Step 5: 检查最终工作区**

```bash
git diff --check
git status --short --branch
git log --oneline --decorate -10
```

Expected: 无空白错误；工作区状态和提交边界清晰。

- [ ] **Step 6: 请求整体代码审查**

使用 `superpowers:requesting-code-review` 审查第一阶段是否符合规范，重点检查行为回归、props/emits 类型、响应式状态所有权、导出 DOM 和 UnoCSS 等价性。只处理经验证的发现，不顺带重构其他页面。
