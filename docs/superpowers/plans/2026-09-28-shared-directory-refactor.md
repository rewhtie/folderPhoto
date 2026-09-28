# Shared 目录与 GameReview 逻辑重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将平铺的 `src/shared` 重组为 `common` 与明确的功能域目录，并把 `GameReview.vue` 的纯业务规则迁入 `shared/game-review`，同时保持所有运行时行为和持久化数据兼容。

**Architecture:** 组件、App 和 Electron 直接导入具体功能模块；功能模块只向下依赖 `common`，`common` 不依赖任何业务域。`GameReview.vue` 继续负责 Vue 状态、DOM 和副作用，纯模型、配置、格式化、排序、存储与备份进入 `shared/game-review`。

**Tech Stack:** Vue 3、TypeScript、Vitest、Electron、UnoCSS、ES modules

**Spec:** `docs/superpowers/specs/2026-09-28-shared-directory-refactor-design.md`

## Global Constraints

- 不运行测试、类型检查或构建。
- 只使用静态文件读取和全局引用搜索检查迁移结果。
- 不创建 `index.ts` barrel 文件；所有调用方直接导入具体模块。
- 不修改页面行为、样式、业务文案、Electron IPC 载荷或全局接口。
- 不修改 localStorage key、存储版本、JSON 备份格式或游戏类型稳定 ID。
- Electron 源文件中的相对 ESM 导入继续保留 `.js` 后缀。
- 不添加依赖。
- 不提交 Git；只有用户明确要求时才提交。
- 当前工作树已有用户修改；只移动和编辑本计划列出的内容，不覆盖无关改动。

## Review Focus

- Electron 与 `src/env.d.ts` 的跨进程契约路径必须全部更新，且 Electron 导入保留 `.js`。
- 游戏测评旧 localStorage 数据、旧备份文件和类型 aliases 必须保持兼容。
- `ReviewRank.vue` 对测评存储和 review pool 的依赖必须指向正确功能域。
- 拆分 `GameReview.vue` 后，DOM、Vue 响应式状态和副作用不能进入纯业务模块。
- 删除旧平铺文件前，所有源代码与测试必须已经切换到新路径。

---

## 文件结构锁定

### 新建目录与模块

```text
src/shared/
├─ common/
│  ├─ contracts/
│  │  ├─ image-library.ts
│  │  └─ owned-games.ts
│  ├─ format.ts
│  ├─ format.test.ts
│  ├─ local-image-picker.ts
│  ├─ local-image-picker.test.ts
│  ├─ theme.ts
│  └─ theme.test.ts
├─ image-library/
│  └─ file-name-config.ts
├─ collections/
│  ├─ model.ts
│  └─ model.test.ts
├─ collage/
│  ├─ layout.ts
│  └─ layout.test.ts
├─ career-collage/
│  ├─ tiers.ts
│  └─ tiers.test.ts
├─ tier-list/
│  ├─ model.ts
│  └─ model.test.ts
├─ review-rank/
│  └─ pool.ts
└─ game-review/
   ├─ model.ts
   ├─ catalog.ts
   ├─ selection.ts
   ├─ selection.test.ts
   ├─ formatting.ts
   ├─ order.ts
   ├─ storage.ts
   ├─ storage.test.ts
   └─ backup.ts
```

### 删除的旧平铺文件

迁移完成后删除 `src/shared` 根目录下的全部现有 `.ts` 和 `.test.ts` 文件。`src/shared` 根目录只保留上面的子目录。

---

### Task 1: 迁移 common 基础能力与跨进程契约

**Files:**
- Create from existing: `src/shared/common/contracts/image-library.ts`
- Create from existing: `src/shared/common/contracts/owned-games.ts`
- Create from existing: `src/shared/common/format.ts`
- Create from existing: `src/shared/common/format.test.ts`
- Create from existing: `src/shared/common/local-image-picker.ts`
- Create from existing: `src/shared/common/local-image-picker.test.ts`
- Create from existing: `src/shared/common/theme.ts`
- Create from existing: `src/shared/common/theme.test.ts`
- Modify: `src/App.vue`
- Modify: `src/components/GameDetail.vue`
- Modify: `src/components/CollageDialog.vue`
- Modify: `src/components/ReviewRank.vue`
- Modify: `src/components/GameReview.vue`
- Modify: `src/components/CareerCollage.vue`
- Modify: `src/env.d.ts`
- Modify: `electron/imageScanner.ts`
- Modify: `electron/ownedGamesStore.ts`
- Modify: `electron/main.ts`
- Delete after imports switch: `src/shared/imageLibrary.ts`
- Delete after imports switch: `src/shared/ownedGames.ts`
- Delete after imports switch: `src/shared/format.ts`
- Delete after imports switch: `src/shared/format.test.ts`
- Delete after imports switch: `src/shared/localImagePicker.ts`
- Delete after imports switch: `src/shared/localImagePicker.test.ts`
- Delete after imports switch: `src/shared/theme.ts`
- Delete after imports switch: `src/shared/theme.test.ts`

**Interfaces:**
- Produces unchanged exports from `common/contracts/image-library.ts`: `ImageAsset`, `ScanImagesResult`, `ScanImagesOptions`, `SelectDirectoryResult`.
- Produces unchanged exports from `common/contracts/owned-games.ts`: `OwnedGame`, `OwnedGamesResult`.
- Produces unchanged exports from `common/format.ts`: `formatFileSize(sizeBytes: number): string`.
- Produces unchanged exports from `common/local-image-picker.ts`: `PickLocalImagesOptions`, `pickLocalImages(options?): Promise<string[]>`.
- Produces unchanged exports from `common/theme.ts`: `Theme`, `getSavedTheme`, `nextTheme`, `saveTheme`.

- [ ] **Step 1: Create the common directories**

Create `src/shared/common/contracts` and `src/shared/common` without adding an `index.ts`.

- [ ] **Step 2: Move the two contract modules without changing contents**

Move:

```text
src/shared/imageLibrary.ts → src/shared/common/contracts/image-library.ts
src/shared/ownedGames.ts   → src/shared/common/contracts/owned-games.ts
```

Preserve every exported name and field.

- [ ] **Step 3: Move format, image picker, and theme with their tests**

Move each implementation and colocated test. Update only each test's local import:

```ts
import { formatFileSize } from './format'
import { pickLocalImages } from './local-image-picker'
import { getSavedTheme, nextTheme, saveTheme } from './theme'
```

- [ ] **Step 4: Update renderer imports**

Use exact concrete paths, for example:

```ts
import { formatFileSize } from './shared/common/format'
import type { ImageAsset } from './shared/common/contracts/image-library'
import { getSavedTheme, nextTheme, saveTheme, type Theme } from './shared/common/theme'
```

Component-relative imports use `../shared/common/...`.

- [ ] **Step 5: Update global contract imports**

In `src/env.d.ts`, replace old contract paths with:

```ts
import type { ScanImagesResult, SelectDirectoryResult } from './shared/common/contracts/image-library'
import type { OwnedGamesResult } from './shared/common/contracts/owned-games'
```

Leave unrelated global declarations unchanged.

- [ ] **Step 6: Update Electron contract imports**

Use `.js` suffixes:

```ts
import type { ImageAsset, ScanImagesResult, ScanImagesOptions } from '../src/shared/common/contracts/image-library.js'
import type { OwnedGame } from '../src/shared/common/contracts/owned-games.js'
```

Update every Electron file that imported the old paths.

- [ ] **Step 7: Statically search for old common paths**

Search all TypeScript and Vue files for:

```text
shared/imageLibrary
shared/ownedGames
shared/format
shared/localImagePicker
shared/theme
```

Expected: zero matches. Do not run project commands.

---

### Task 2: Migrate image-library, collections, collage, and career-collage domains

**Files:**
- Create from existing: `src/shared/image-library/file-name-config.ts`
- Create from existing: `src/shared/collections/model.ts`
- Create from existing: `src/shared/collections/model.test.ts`
- Create from existing: `src/shared/collage/layout.ts`
- Create from existing: `src/shared/collage/layout.test.ts`
- Create from existing: `src/shared/career-collage/tiers.ts`
- Create from existing: `src/shared/career-collage/tiers.test.ts`
- Modify: `src/App.vue`
- Modify: `src/components/CollageDialog.vue`
- Modify: `src/components/CareerCollage.vue`
- Modify: `src/env.d.ts`
- Modify: `electron/imageScanner.ts`
- Modify: `electron/collectionsStore.ts`
- Modify: `electron/main.ts`
- Delete migrated root files after imports switch.

**Interfaces:**
- Preserves `FILE_NAME_CONFIG`, `SCAN_KEYWORDS`.
- Preserves `Collections`, `addPathsToCollection`, `removePathFromCollection`.
- Preserves `CollageImage`, `CollageDraw`, `CollageLayout`, `dominantAspectRatio`, `computeLayout`, `moveItem`.
- Preserves `Tier`, `Orientation`, `TieredGames`, `tierGames`.
- Consumes `OwnedGame` from `shared/common/contracts/owned-games`.

- [ ] **Step 1: Move image file-name configuration**

Move `imageNameConfig.ts` to `image-library/file-name-config.ts`. Update:

```ts
// src/App.vue
import { FILE_NAME_CONFIG } from './shared/image-library/file-name-config'

// electron/imageScanner.ts
import { SCAN_KEYWORDS } from '../src/shared/image-library/file-name-config.js'
```

- [ ] **Step 2: Move collections model and test**

Move `collections.ts` to `collections/model.ts` and its test to `collections/model.test.ts`. Keep all exports unchanged. Update App, env, and Electron imports; Electron uses:

```ts
import type { Collections } from '../src/shared/collections/model.js'
```

- [ ] **Step 3: Move collage layout and test**

Move `collage.ts` to `collage/layout.ts` and its test beside it. Update `CollageDialog.vue`:

```ts
import {
  computeLayout,
  dominantAspectRatio,
  moveItem,
  type CollageImage,
} from '../shared/collage/layout'
```

- [ ] **Step 4: Move career collage tiers and test**

Move `careerCollage.ts` to `career-collage/tiers.ts`. Change its contract import to:

```ts
import type { OwnedGame } from '../common/contracts/owned-games.js'
```

Update the test and `CareerCollage.vue` to import from concrete new paths.

- [ ] **Step 5: Statically search for old domain paths**

Search for:

```text
shared/imageNameConfig
shared/collections
shared/collage
shared/careerCollage
```

Exclude the new directory paths when interpreting results. Expected: no import points to a removed root file.

---

### Task 3: Migrate tier-list and review-rank domains

**Files:**
- Create from existing: `src/shared/tier-list/model.ts`
- Create from existing: `src/shared/tier-list/model.test.ts`
- Create from existing: `src/shared/review-rank/pool.ts`
- Modify: `src/App.vue`
- Modify: `src/components/ReviewRank.vue`
- Modify: `src/env.d.ts`
- Modify: `electron/tierListStore.ts`
- Modify: `electron/main.ts`
- Delete after imports switch: `src/shared/tierList.ts`
- Delete after imports switch: `src/shared/tierList.test.ts`
- Delete after imports switch: `src/shared/reviewPool.ts`

**Interfaces:**
- Preserves all tier-list exports: `TierKey`, `TIER_ORDER`, `TierEntry`, `TierList`, `emptyTierList`, `addToPool`, `moveEntry`, `tierLabelFromUrl`.
- Preserves review-rank bridge exports: `reviewPool`, `addToReviewPool`, `takeReviewPool`.
- `review-rank/pool.ts` consumes `TierEntry` from `../tier-list/model.js`.

- [ ] **Step 1: Move tier-list model and test**

Move the implementation and test without changing behavior. Update direct imports in App, ReviewRank, env, and Electron. Electron uses:

```ts
import { emptyTierList, type TierList } from '../src/shared/tier-list/model.js'
```

- [ ] **Step 2: Move review pool bridge**

Move `reviewPool.ts` to `review-rank/pool.ts` and update its internal import:

```ts
import type { TierEntry } from '../tier-list/model.js'
```

Update App and ReviewRank imports to `shared/review-rank/pool`.

- [ ] **Step 3: Check the dependency direction**

Use static search to confirm:

- `review-rank/pool.ts` imports tier-list model.
- `tier-list/model.ts` imports neither Vue components nor review-rank.
- No source imports `shared/tierList` or `shared/reviewPool`.

---

### Task 4: Split and migrate the game-review model, selection, storage, and backup

**Files:**
- Create: `src/shared/game-review/model.ts`
- Create: `src/shared/game-review/selection.ts`
- Create from existing: `src/shared/game-review/selection.test.ts`
- Create: `src/shared/game-review/storage.ts`
- Create from existing: `src/shared/game-review/storage.test.ts`
- Create: `src/shared/game-review/backup.ts`
- Modify: `src/App.vue`
- Modify: `src/components/GameReview.vue`
- Modify: `src/components/ReviewRank.vue`
- Delete after imports switch: `src/shared/gameReview.ts`
- Delete after imports switch: `src/shared/gameReview.test.ts`
- Delete after imports switch: `src/shared/gameReviewStorage.ts`
- Delete after imports switch: `src/shared/gameReviewStorage.test.ts`
- Delete after imports switch: `src/shared/gameReviewBackup.ts`

**Interfaces:**
- `model.ts` produces `GameReviewItem`, `GameReviewDraft`, `StoredGameReview`, `StoredCustomGame`.
- `selection.ts` produces `selectedGamesForReview(images: ImageAsset[], selectedPaths: ReadonlySet<string>): GameReviewItem[]`.
- `storage.ts` preserves `normalizeGameReviewDraft`, all load/save functions, and `mergeGamesWithStoredReviews`.
- `backup.ts` preserves all backup constants, types, error class, parse, merge, and create functions.

- [ ] **Step 1: Create the domain model**

Create `model.ts` with the existing interfaces and no runtime imports:

```ts
export interface GameReviewItem {
  appId: string
  appName: string
  coverUrl: string
}

export interface GameReviewDraft {
  type: string[]
  experience: string
  duration: string
  rating: number
  recommendation: string
  coverBlurred: boolean
}

export interface StoredGameReview extends GameReviewDraft {
  appName: string
  coverUrl?: string
}

export interface StoredCustomGame {
  appId: string
  appName: string
  review: GameReviewDraft
}
```

- [ ] **Step 2: Create selection.ts from gameReview.ts**

Move `selectedGamesForReview` into `selection.ts` and import:

```ts
import type { ImageAsset } from '../common/contracts/image-library.js'
import type { GameReviewItem } from './model.js'
```

Move the existing test to `selection.test.ts` and update its imports to `../common/contracts/image-library` and `./selection`.

- [ ] **Step 3: Split storage types from storage behavior**

Move the storage implementation to `storage.ts`. Remove interface declarations now owned by `model.ts`. `storage.ts` imports these types but does not re-export them:

```ts
import type {
  GameReviewDraft,
  GameReviewItem,
  StoredCustomGame,
  StoredGameReview,
} from './model.js'
```

Update every caller to import domain types directly from `model.ts`; runtime storage functions come from `storage.ts`.

Keep these exact constants and serialized values unchanged:

```ts
'steam-image-browser-game-review-drafts'
'steam-image-browser-game-review-order'
'steam-image-browser-game-review-custom-games'
STORAGE_VERSION = 2
CUSTOM_GAMES_STORAGE_VERSION = 1
```

- [ ] **Step 4: Move the storage test**

Move the test to `storage.test.ts`. Import runtime functions from `./storage` and import `StoredGameReview` directly from `./model`. Do not alter fixtures or expectations.

- [ ] **Step 5: Move backup behavior**

Move `gameReviewBackup.ts` to `backup.ts` and update imports to:

```ts
import { normalizeGameReviewDraft } from './storage.js'
import type {
  GameReviewDraft,
  StoredCustomGame,
  StoredGameReview,
} from './model.js'
```

Keep `GAME_REVIEW_BACKUP_FORMAT`, version `1`, error messages, merge rules, and output shape unchanged.

- [ ] **Step 6: Update all game-review callers**

Use concrete imports:

```ts
import type { GameReviewItem } from '../shared/game-review/model'
import { selectedGamesForReview } from './shared/game-review/selection'
import { loadGameReviews } from '../shared/game-review/storage'
import { createGameReviewBackup } from '../shared/game-review/backup'
```

Update App, GameReview, and ReviewRank without changing their behavior.

- [ ] **Step 7: Search for old game-review paths**

Search for:

```text
shared/gameReview
shared/gameReviewStorage
shared/gameReviewBackup
```

Expected: zero imports of removed root files.

---

### Task 5: Extract the stable game-type catalog

**Files:**
- Create: `src/shared/game-review/catalog.ts`
- Modify: `src/components/GameReview.vue:147-157,472-524`

**Interfaces:**
- Produces `GameTypeDefinition`.
- Produces `GAME_TYPES: Readonly<Record<string, GameTypeDefinition>>`.
- Produces `GAME_TYPE_OPTIONS: readonly GameTypeOption[]`.
- Produces `normalizeGameTypeIds(types: readonly string[]): string[]`.
- Produces `gameTypeLabel(typeId: string): string`.
- Produces `gameTypeColor(typeId: string): string | undefined`.

- [ ] **Step 1: Create catalog.ts with the current catalog unchanged**

Move the current stable IDs, labels, colors, and aliases exactly as they exist in `GameReview.vue`. Define:

```ts
export interface GameTypeDefinition {
  label: string
  color: string
  aliases?: readonly string[]
}

export interface GameTypeOption extends GameTypeDefinition {
  id: string
}
```

Do not rename IDs or alter current labels, including the current butter emoji label.

- [ ] **Step 2: Build the alias index inside catalog.ts**

Use the current behavior:

```ts
const typeAliases = new Map<string, string>()
for (const type of GAME_TYPE_OPTIONS) {
  typeAliases.set(type.id, type.id)
  typeAliases.set(type.label, type.id)
  for (const alias of type.aliases ?? []) typeAliases.set(alias, type.id)
}
```

- [ ] **Step 3: Export pure lookup and migration functions**

Implement exact behavior:

```ts
export function normalizeGameTypeIds(types: readonly string[]): string[] {
  const typeIds = new Set<string>()
  for (const type of types) {
    const typeId = typeAliases.get(type)
    if (typeId) typeIds.add(typeId)
  }
  return [...typeIds]
}

export function gameTypeLabel(typeId: string): string {
  return GAME_TYPES[typeId]?.label ?? typeId
}

export function gameTypeColor(typeId: string): string | undefined {
  return GAME_TYPES[typeId]?.color
}
```

- [ ] **Step 4: Replace component-local catalog code**

Import the exported options and functions. Keep only the UI-shaped wrapper in the component:

```ts
function typeStyle(typeId: string): { color?: string } {
  return { color: gameTypeColor(typeId) }
}
```

Replace `typeOptions` with `GAME_TYPE_OPTIONS` in both template loops, or alias it once at import if needed to minimize template churn. Remove the component-local definition, alias map, normalizer, and label lookup.

- [ ] **Step 5: Statically check stable IDs and aliases**

Compare catalog content against the pre-move component block. Confirm every ID, label, color, and alias appears exactly once and no value changed.

---

### Task 6: Extract game-review formatting and order rules

**Files:**
- Create: `src/shared/game-review/formatting.ts`
- Create: `src/shared/game-review/order.ts`
- Modify: `src/components/GameReview.vue:316-338,541-573,702-704`

**Interfaces:**
- `formatting.ts` produces:
  - `recommendationClass(recommendation: string): string`
  - `durationClass(duration: string): string`
  - `normalizeDuration(value: string): string`
  - `formatSteamPlaytime(minutes: number): string`
- `order.ts` produces:
  - `DropPosition = 'before' | 'after'`
  - `reorderIds(order: readonly string[], sourceId: string, targetId: string, position: DropPosition): string[]`

- [ ] **Step 1: Move formatting functions without changing outputs**

Copy the current mappings, thresholds, regexes, and rounding expression exactly. The module must not import Vue or access DOM APIs.

- [ ] **Step 2: Create the pure reorder function**

Implement the current array behavior:

```ts
export type DropPosition = 'before' | 'after'

export function reorderIds(
  order: readonly string[],
  sourceId: string,
  targetId: string,
  position: DropPosition,
): string[] {
  const next = [...order]
  const sourceIndex = next.indexOf(sourceId)
  if (sourceIndex < 0 || sourceId === targetId) return next
  const [movedId] = next.splice(sourceIndex, 1)
  const targetIndex = next.indexOf(targetId)
  if (targetIndex < 0) return [...order]
  next.splice(targetIndex + (position === 'after' ? 1 : 0), 0, movedId)
  return next
}
```

- [ ] **Step 3: Update GameReview imports and applyReorder**

Replace only the pure array mutation block:

```ts
const orderedIds = reorderIds(
  allGames.value.map((game) => game.appId),
  draggedAppId.value,
  dropTarget.value.appId,
  dropTarget.value.position,
)
```

Keep persistence, emit, maps, Pointer events, and Vue refs in the component.

- [ ] **Step 4: Remove duplicate component-local formatting functions**

Import the four formatting functions and delete their old declarations. Keep `updateDuration`, because it reads and mutates an `HTMLInputElement` and restores caret position.

- [ ] **Step 5: Check extracted modules for forbidden dependencies**

Static search within `catalog.ts`, `formatting.ts`, and `order.ts` for:

```text
from 'vue'
window
 document
HTMLElement
MouseEvent
PointerEvent
```

Expected: zero matches.

---

### Task 7: Finish GameReview component integration and preserve side effects

**Files:**
- Modify: `src/components/GameReview.vue`
- Inspect: `src/shared/game-review/*.ts`

**Interfaces:**
- Consumes all concrete game-review modules created in Tasks 4–6.
- Leaves component props and emits unchanged:
  - `games: GameReviewItem[]`
  - `reorder: [games: GameReviewItem[]]`

- [ ] **Step 1: Consolidate imports by concrete module**

The component import section should follow this shape:

```ts
import type {
  GameReviewDraft,
  GameReviewItem,
  StoredCustomGame,
  StoredGameReview,
} from '../shared/game-review/model'
import {
  GAME_TYPE_OPTIONS,
  gameTypeColor,
  gameTypeLabel,
  normalizeGameTypeIds,
} from '../shared/game-review/catalog'
import {
  durationClass,
  formatSteamPlaytime,
  normalizeDuration,
  recommendationClass,
} from '../shared/game-review/formatting'
import { reorderIds, type DropPosition } from '../shared/game-review/order'
```

Storage and backup imports remain separate concrete modules.

- [ ] **Step 2: Confirm Vue and DOM concerns remain local**

Keep these declarations in `GameReview.vue`:

- all `ref`, `reactive`, `computed`, and `watch` declarations;
- `FloatingMenu`, `PendingDrag`, menu position and toggles;
- Pointer event handlers and `document.elementFromPoint`;
- textarea resize directive and caret restoration;
- screenshot export and asset waiting;
- import/export file input orchestration;
- persistence scheduling and lifecycle hooks.

If any migrated module now accepts Vue refs or DOM elements, move that logic back into the component.

- [ ] **Step 3: Check template names against imports**

Static search every moved identifier used in the template and script. Confirm each is imported or still locally declared:

```text
GAME_TYPE_OPTIONS / typeOptions
gameTypeLabel / typeLabel
typeStyle
recommendationClass
durationClass
normalizeDuration
formatSteamPlaytime
reorderIds
```

- [ ] **Step 4: Compare persistence and backup constants**

Read the new `storage.ts` and `backup.ts` and compare them to the design constraints. Confirm no string key, format name, version number, field, or error message changed.

---

### Task 8: Remove legacy files and perform the static dependency audit

**Files:**
- Delete: every migrated `src/shared/*.ts` and `src/shared/*.test.ts` root file
- Inspect: all `src/**/*.{ts,vue}` and `electron/**/*.ts`
- Inspect: `src/shared/**/*`

**Interfaces:**
- Final dependency direction: `components/App/electron → feature modules → common`.
- No `index.ts` entry points.

- [ ] **Step 1: Confirm every legacy file has a target**

Compare the root-level file list against the migration table in the spec. Do not delete a file without a corresponding new module and updated callers.

- [ ] **Step 2: Delete the old root-level shared files**

After Tasks 1–7 have switched all imports, remove the legacy copies. Preserve only subdirectories under `src/shared`.

- [ ] **Step 3: Search for legacy import paths**

Use static content search across `src`, `electron`, and tests for all old basenames:

```text
shared/imageLibrary
shared/ownedGames
shared/format
shared/localImagePicker
shared/theme
shared/imageNameConfig
shared/collections
shared/collage
shared/careerCollage
shared/tierList
shared/reviewPool
shared/gameReview
shared/gameReviewStorage
shared/gameReviewBackup
```

Expected: zero imports that point to removed root files. New nested paths such as `shared/collage/layout` are valid.

- [ ] **Step 4: Audit Electron ESM suffixes**

Search Electron imports that reference `src/shared`. Every relative import must end in `.js`, for example:

```ts
from '../src/shared/tier-list/model.js'
```

- [ ] **Step 5: Audit dependency direction**

Search `src/shared/common` for imports containing `../game-`, `../tier-`, `../collage`, `../collections`, `../review-rank`, or Vue component paths. Expected: zero matches.

Search all `src/shared` modules for imports from `src/components` or `../components`. Expected: zero matches.

- [ ] **Step 6: Audit the final tree**

List `src/shared/**/*` and compare it to the locked file structure. Expected:

- no root-level `.ts` files;
- no `index.ts` files;
- each test colocated with its implementation;
- all planned game-review modules present.

- [ ] **Step 7: Report skipped verification explicitly**

Final handoff must state:

```text
未运行测试、类型检查或构建，遵循用户要求。已完成旧导入路径、Electron .js 后缀和依赖方向的静态搜索。
```

Also report any static-search matches that could not be resolved; do not claim the refactor is runtime-verified.
