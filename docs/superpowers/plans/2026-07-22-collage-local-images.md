# 拼图模态导入本地图片 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在拼图模态里新增「导入本地图片」按钮，通过系统文件多选框加入任意本地图片，与已选扫描图一同拼图导出。

**Architecture:** 新增 IPC `collage:pick-local-images` 用 `dialog.showOpenDialog` 多选图片，用现有 `toImageSourceUrl` 转成 `local-image://` URL；`CollageDialog` 合并 `props.urls` 与本地导入的 `localUrls`，复用同一渲染/拖拽/导出路径——协议一致保证 CORS 与 canvas 导出不污染。

**Tech Stack:** Electron、Vue 3 `<script setup>`、TypeScript、Vitest。

## Global Constraints

- 本地图片扩展名白名单与扫描器 `IMAGE_EXTENSIONS`（[electron/imageScanner.ts:11](electron/imageScanner.ts#L11)）一致：`jpg, jpeg, png, webp, gif, bmp`。
- 本地图片只在模态生命周期内有效，关闭即清空，不写盘、不进收藏夹。
- `openCollageDialog` 的 `selectedPaths.size === 0` 前置校验保持不变（至少选 1 张扫描图才能进拼图）。
- 复用 `local-image://` 协议（已 `corsEnabled: true`，[electron/main.ts:55](electron/main.ts#L55)），不为本地图片开新协议或新特例。
- IPC 命名前缀沿用现有 `collage:` 命名空间。

---

### Task 1: 新增 `collage:pick-local-images` IPC

**Files:**
- Modify: `electron/main.ts`（在 `collage:save` handler 附近新增 handler；并在顶部 import `toImageSourceUrl`）

**Interfaces:**
- Consumes: `toImageSourceUrl(absolutePath: string): string`（来自 `electron/imageProtocol.ts`，已存在）
- Produces: IPC channel `collage:pick-local-images`，返回 `string[] | null`（`null` 表示取消/未选；元素为 `local-image://file/<encoded>` URL）

- [ ] **Step 1: 在 [electron/main.ts](electron/main.ts) 顶部补 import**

把第 6 行
```ts
import { imageSourceUrlToFileUrl } from './imageProtocol.js'
```
改成
```ts
import { imageSourceUrlToFileUrl, toImageSourceUrl } from './imageProtocol.js'
```

- [ ] **Step 2: 新增 IPC handler**

在 `ipcMain.handle('collage:save', …)` 之前（[electron/main.ts:130](electron/main.ts#L130) 附近）插入：
```ts
ipcMain.handle('collage:pick-local-images', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择本地图片',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths.map((p) => toImageSourceUrl(p))
})
```

- [ ] **Step 3: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无新增错误（`toImageSourceUrl` 与 `dialog` 已在作用域内）。

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat(collage): add collage:pick-local-images IPC for multi-select local images"
```

---

### Task 2: 在 preload 暴露 `pickLocalImages` 并补类型声明

**Files:**
- Modify: `electron/preload.cts`（在 `saveCollage` 之后新增方法）
- Modify: `src/env.d.ts`（在 `saveCollage` 类型声明之后新增 `pickLocalImages`）

**Interfaces:**
- Consumes: IPC channel `collage:pick-local-images`（Task 1 产出）
- Produces: `window.imageLibrary.pickLocalImages(): Promise<string[] | null>`

- [ ] **Step 1: preload 新增方法**

在 [electron/preload.cts](electron/preload.cts) 的 `saveCollage` 方法之后插入：
```ts
  pickLocalImages(): Promise<string[] | null> {
    return ipcRenderer.invoke('collage:pick-local-images')
  },
```
（注意 `saveCollage` 末尾有逗号，照此结构补一个带尾逗号的方法即可。）

- [ ] **Step 2: 补 `window.imageLibrary` 类型声明**

在 [src/env.d.ts](src/env.d.ts) 第 56 行 `saveCollage(...): Promise<string | null>` 之后新增一行：
```ts
      pickLocalImages(): Promise<string[] | null>
```
（带尾逗号，与相邻声明风格一致。）

- [ ] **Step 3: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 4: Commit**

```bash
git add electron/preload.cts src/env.d.ts
git commit -m "feat(collage): expose pickLocalImages on preload bridge"
```

---

### Task 3: `CollageDialog` 合并本地图片并接入导入按钮

**Files:**
- Modify: `src/components/CollageDialog.vue`

**Interfaces:**
- Consumes: `window.imageLibrary.pickLocalImages(): Promise<string[] | null>`（Task 2 产出）；props `urls: string[]`（已选扫描图 fileUrl）
- Produces: 拼图模态内可导入本地图片并与已选图一同渲染/拖拽/导出。

- [ ] **Step 1: 改 script——引入 `localUrls` 与 `allUrls`，替换全部 `props.urls`/`n` 引用**

在 [src/components/CollageDialog.vue](src/components/CollageDialog.vue) `<script setup>` 中：

1. 把
```ts
const n = computed(() => props.urls.length)
```
改成
```ts
const localUrls = ref<string[]>([])
const allUrls = computed(() => [...props.urls, ...localUrls.value])
const n = computed(() => allUrls.value.length)
```

2. `onMounted` 里
```ts
orderedIndices.value = Array.from({ length: n.value }, (_, i) => i)
```
保持不变（`n` 现在基于 `allUrls`）。

3. 在 `onMounted` 之后新增 `watch`，当 `allUrls` 增长时把新下标追加到 `orderedIndices` 末尾。先确保从 `vue` 导入了 `watch`：
```ts
import { computed, onMounted, ref, watch } from 'vue'
```
然后在 `onMounted` 块之后加：
```ts
watch(
  n,
  (newN, oldN) => {
    if (newN <= oldN) return
    for (let i = oldN; i < newN; i++) {
      orderedIndices.value.push(i)
    }
  },
)
```

4. 模板里 `<img :src="urls[idx]"` 改成
```html
:src="allUrls[idx]"
```

5. 新增导入处理函数（放在 `onImgLoad` 附近）：
```ts
async function pickLocalImages(): Promise<void> {
  const picked = await window.imageLibrary.pickLocalImages()
  if (!picked || picked.length === 0) return
  localUrls.value.push(...picked)
}
```

- [ ] **Step 2: 改 template——加「导入本地图片」按钮**

在 [src/components/CollageDialog.vue](src/components/CollageDialog.vue) 模板里，`<p>已选 {{ n }} 张图片（拖拽可调整位置）</p>` 之后插入：
```html
<div class="collage-toolbar">
  <button class="ghost-button" type="button" @click="pickLocalImages">导入本地图片</button>
</div>
```

- [ ] **Step 3: 加样式**

在 `<style scoped>` 内追加：
```css
.collage-toolbar {
  margin-bottom: 14px;
}
```

- [ ] **Step 4: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 5: 手动冒烟测试**

启动应用（`npm run dev`），扫描一个 librarycache 目录，勾选 ≥1 张扫描图，点「拼图」打开模态：

1. 点「导入本地图片」→ 系统文件框弹出，多选若干 jpg/png → 确认后这些图出现在网格末尾。
2. 取消文件框 → 模态无变化、无报错。
3. 调行列/总宽 → 已选图与本地图一起布局；拖拽可把本地图移到前面。
4. 导出 PNG → 保存的文件同时含扫描图与本地图。
5. 关闭再重开模态 → 之前导入的本地图片已清空（只剩已选扫描图）。

Expected: 全部通过；导出 PNG 无 canvas 跨源污染报错（控制台无 "tainted" 报错）。

- [ ] **Step 6: Commit**

```bash
git add src/components/CollageDialog.vue
git commit -m "feat(collage): import local images into collage modal"
```
