# 拼图拖拽排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 CollageDialog 拼图预览中支持拖拽排序，用户可拖动图片在网格中的位置。

**Architecture:** 预览从 `<canvas>` 改为 DOM 网格（`<img>` + CSS grid），用 HTML5 原生拖拽 API 实现排序。导出仍用隐藏 Canvas + `computeLayout` + `toBlob`。数组移动逻辑抽成纯函数 `moveItem` 可单测。

**Tech Stack:** Vue 3 `<script setup>`、HTML5 Drag and Drop API、Canvas 2D API（导出用）、Vitest。

## Global Constraints

- `computeLayout`（src/shared/collage.ts）不变，已有 11 个测试不修改。
- IPC `collage:save` 不变。
- props `{ urls: string[] }`、emits `{ close: [] }` 不变。
- 所有 DOM `<img>` 保持 `crossOrigin='anonymous'`（维持 CORS 修复）。
- 导出流程不变（隐藏 canvas + toBlob + IPC）。
- 弹窗样式风格不变（深色卡片 #172033、圆角 18px）。
- 测试风格遵循 src/shared/format.test.ts。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/shared/collage.ts` | 新增 `moveItem<T>(arr, from, to): T[]` 纯函数（可单测）。 |
| `src/shared/collage.test.ts` | 新增 `moveItem` 测试。 |
| `src/components/CollageDialog.vue` | 重写：DOM 网格预览 + 拖拽排序 + 隐藏 Canvas 导出。 |

---

### Task 1: `moveItem` 纯函数 + 单测

**Files:**
- Modify: `src/shared/collage.ts` (追加)
- Modify: `src/shared/collage.test.ts` (追加)

**Interfaces:**
- Produces: `moveItem<T>(arr: readonly T[], from: number, to: number): T[]` — 返回新数组，from 位置元素移到 to 位置，中间元素前移/后移。不修改原数组。

- [ ] **Step 1: Write the failing test**

在 `src/shared/collage.test.ts` 文件末尾追加：

```ts
import { computeLayout, dominantAspectRatio, moveItem } from './collage'
```

（修改已有 import 行，加入 `moveItem`。）

然后在文件末尾追加：

```ts
describe('moveItem', () => {
  it('moves an item forward', () => {
    expect(moveItem([10, 20, 30, 40], 0, 2)).toEqual([20, 30, 10, 40])
  })

  it('moves an item backward', () => {
    expect(moveItem([10, 20, 30, 40], 3, 1)).toEqual([10, 30, 20, 40])
  })

  it('is a no-op when from === to', () => {
    expect(moveItem([10, 20, 30], 1, 1)).toEqual([10, 20, 30])
  })

  it('handles single-element array', () => {
    expect(moveItem([10], 0, 0)).toEqual([10])
  })

  it('does not mutate the original array', () => {
    const arr = [10, 20, 30]
    moveItem(arr, 0, 2)
    expect(arr).toEqual([10, 20, 30])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/collage.test.ts`
Expected: FAIL with "moveItem is not exported from './collage'".

- [ ] **Step 3: Write minimal implementation**

在 `src/shared/collage.ts` 文件末尾追加：

```ts
// 将 from 位置的元素移到 to 位置，返回新数组，不修改原数组
export function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  if (from === to) return [...arr]
  const result = [...arr]
  const [item] = result.splice(from, 1)
  result.splice(to, 0, item)
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/collage.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/collage.ts src/shared/collage.test.ts
git commit -m "feat: moveItem 纯函数用于数组拖拽排序"
```

---

### Task 2: 重写 CollageDialog 为 DOM 网格预览 + 拖拽

**Files:**
- Rewrite: `src/components/CollageDialog.vue`

**Interfaces:**
- Consumes: `computeLayout` from `src/shared/collage.ts`（不变）；`moveItem` from `src/shared/collage.ts`（Task 1）；`window.imageLibrary.saveCollage`（不变）。
- Produces: 不变 — props `{ urls: string[] }`，emits `{ close: [] }`。

**实现要点：**

1. 移除 `loadedImages` ref 和 `loadImages()` 函数（DOM `<img>` 自行加载）。
2. 新增 `orderedIndices = ref<number[]>([])`，`onMounted` 时初始化 `[0, 1, ..., n-1]`。
3. 新增 `imgRefMap = new Map<number, HTMLImageElement>()`（非响应式，纯导出用）。`<img>` 通过函数 ref `:ref="el => registerImg(idx, el)"` 注册。
4. 模板预览区：`<div class="collage-grid" :style="{ gridTemplateColumns: 'repeat(${cols}, 1fr)' }">` 内含 `v-for="idx in orderedIndices"` 的 `<img>`，每个 `draggable`，绑 `dragstart`/`dragover`/`drop`。
5. 拖拽时更新 `orderedIndices`：`dragstart` 记录 `dragFrom`，`drop` 时 `orderedIndices = moveItem(orderedIndices, dragFrom, dragTo)`。
6. 保留 `<canvas ref="canvasRef">` 但隐藏（`display: none`），仅供导出。
7. `draw()` 改为从 `imgRefMap` 按 `orderedIndices` 顺序取图，构建 `filtered`/`imgs`，其余逻辑不变。
8. 导出时调用 `draw()` 渲染到隐藏 canvas → `toBlob` → `saveCollage`（流程不变）。
9. 所有 `<img>` 设 `crossOrigin="anonymous"`（CORS 修复）。
10. 移除 `watch([rows, cols, totalWidth], () => draw())`（没有可见 canvas 需要重绘）。

- [ ] **Step 1: Rewrite the component**

将 `src/components/CollageDialog.vue` 完整替换为：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { computeLayout, moveItem, type CollageImage } from '../shared/collage'

const props = defineProps<{ urls: string[] }>()
const emit = defineEmits<{ close: [] }>()

const n = computed(() => props.urls.length)

const rows = ref(1)
const cols = ref(1)
const totalWidth = ref(2048)
const format = ref<'png' | 'jpeg'>('png')
const jpgQuality = ref(0.92)
const isExporting = ref(false)
const errorMessage = ref('')

const canvasRef = ref<HTMLCanvasElement | null>(null)
const orderedIndices = ref<number[]>([])
// 非响应式，纯导出用：按原始下标存 <img> 元素引用
const imgRefMap = new Map<number, HTMLImageElement>()

const defaultRows = computed(() => Math.max(1, Math.ceil(Math.sqrt(n.value))))
const defaultCols = computed(() => Math.max(1, Math.ceil(n.value / defaultRows.value)))

onMounted(() => {
  rows.value = defaultRows.value
  cols.value = defaultCols.value
  orderedIndices.value = Array.from({ length: n.value }, (_, i) => i)
})

function registerImg(idx: number, el: unknown): void {
  if (el instanceof HTMLImageElement) {
    imgRefMap.set(idx, el)
  } else {
    imgRefMap.delete(idx)
  }
}

// --- 拖拽 ---
let dragFrom = -1

function onDragStart(idx: number, e: DragEvent): void {
  dragFrom = idx
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
  // 给被拖元素加半透明（通过 CSS :active 处理不了，这里用 class）
}

function onDragOver(idx: number, e: DragEvent): void {
  e.preventDefault() // 允许 drop
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
}

function onDrop(idx: number, e: DragEvent): void {
  e.preventDefault()
  if (dragFrom === -1 || dragFrom === idx) return
  orderedIndices.value = moveItem(orderedIndices.value, dragFrom, idx)
  dragFrom = -1
}

function onDragEnd(): void {
  dragFrom = -1
}

// --- 导出用 draw ---
function draw(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const filtered: HTMLImageElement[] = []
  const imgs: CollageImage[] = []
  for (const idx of orderedIndices.value) {
    const img = imgRefMap.get(idx)
    if (img && img.complete && img.naturalWidth > 0) {
      filtered.push(img)
      imgs.push({ width: img.naturalWidth, height: img.naturalHeight })
    }
  }
  if (imgs.length === 0) return
  const layout = computeLayout(imgs, rows.value, cols.value, clampWidth(totalWidth.value))
  canvas.width = Math.round(layout.canvasWidth)
  canvas.height = Math.round(layout.canvasHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const d of layout.draws) {
    const img = filtered[d.index]
    if (!img) continue
    ctx.drawImage(img, d.sx, d.sy, d.sw, d.sh, d.dx, d.dy, d.dw, d.dh)
  }
}

function clampWidth(w: number): number {
  if (!Number.isFinite(w)) return 2048
  return Math.min(8192, Math.max(256, Math.round(w)))
}

async function exportCollage(): Promise<void> {
  const canvas = canvasRef.value
  if (!canvas || isExporting.value) return
  isExporting.value = true
  errorMessage.value = ''
  try {
    draw()
    const mime = format.value === 'png' ? 'image/png' : 'image/jpeg'
    const quality = format.value === 'png' ? undefined : jpgQuality.value
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, quality),
    )
    if (!blob) {
      errorMessage.value = '导出失败'
      console.error('[collage] toBlob 返回 null（可能 canvas 被跨源图片污染）')
      return
    }
    const buffer = await blob.arrayBuffer()
    const ext = format.value === 'png' ? 'png' : 'jpg'
    const saved = await window.imageLibrary.saveCollage(buffer, `collage.${ext}`)
    if (saved === null) return
    emit('close')
  } catch (err) {
    console.error('[collage] 导出失败:', err)
    errorMessage.value = '导出失败'
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div class="collage-backdrop" @click.self="emit('close')">
    <div class="collage-dialog">
      <h3>拼图</h3>
      <p>已选 {{ n }} 张图片（拖拽可调整位置）</p>

      <div class="collage-fields">
        <label>
          行
          <input v-model.number="rows" type="number" min="1" max="20" class="collage-input" />
        </label>
        <label>
          列
          <input v-model.number="cols" type="number" min="1" max="20" class="collage-input" />
        </label>
        <label>
          总宽
          <input v-model.number="totalWidth" type="number" min="256" max="8192" step="64" class="collage-input" />
        </label>
        <label>
          格式
          <select v-model="format" class="collage-input">
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
          </select>
        </label>
        <label v-if="format === 'jpeg'">
          质量
          <input v-model.number="jpgQuality" type="range" min="0.5" max="1" step="0.01" />
          <span>{{ Math.round(jpgQuality * 100) }}%</span>
        </label>
      </div>

      <div
        class="collage-grid"
        :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)` }"
      >
        <img
          v-for="idx in orderedIndices"
          :key="idx"
          :ref="(el) => registerImg(idx, el)"
          :src="urls[idx]"
          crossOrigin="anonymous"
          draggable="true"
          class="collage-thumb"
          @dragstart="onDragStart(idx, $event)"
          @dragover="onDragOver(idx, $event)"
          @drop="onDrop(idx, $event)"
          @dragend="onDragEnd"
        />
      </div>

      <!-- 隐藏 canvas，仅供导出 -->
      <canvas ref="canvasRef" style="display: none"></canvas>

      <p v-if="errorMessage" class="collage-error">{{ errorMessage }}</p>

      <div class="collage-actions">
        <button class="ghost-button" type="button" @click="emit('close')">取消</button>
        <button class="primary-button" type="button" :disabled="isExporting" @click="exportCollage">
          {{ isExporting ? '导出中…' : '导出' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.collage-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2, 6, 23, 0.66);
}
.collage-dialog {
  width: 640px;
  max-width: 92vw;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 18px;
  background: #172033;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}
.collage-dialog h3 {
  margin: 0 0 8px;
}
.collage-dialog p {
  margin: 0 0 16px;
  color: #94a3b8;
  font-size: 14px;
}
.collage-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 18px;
}
.collage-fields label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #94a3b8;
  font-size: 13px;
}
.collage-input {
  width: 96px;
  padding: 6px 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  font-size: 14px;
}
.collage-grid {
  display: grid;
  gap: 4px;
  margin-bottom: 18px;
  max-height: 50vh;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: #0f172a;
}
.collage-thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 6px;
  border: 2px solid transparent;
  cursor: grab;
  transition: opacity 0.15s, border-color 0.15s;
}
.collage-thumb:hover {
  border-color: rgba(125, 211, 252, 0.4);
}
.collage-thumb:active {
  cursor: grabbing;
  opacity: 0.5;
}
.collage-error {
  color: #fca5a5;
  margin: 0 0 12px;
}
.collage-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run all collage tests**

Run: `npx vitest run src/shared/collage.test.ts`
Expected: PASS (all tests, including moveItem from Task 1).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CollageDialog.vue
git commit -m "feat: CollageDialog DOM 网格预览 + 拖拽排序"
```

---

### Task 3: 验证

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: collage + all non-scanner tests pass. 3 pre-existing scanner failures (Windows file-ordering, not regressions).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Run `npm run dev:electron`. Then:
1. 扫描图片 → 多选若干张 → 点「拼图」。
2. 预览应显示 DOM 网格（`<img>` + CSS grid），每个缩略图正方形、object-fit:cover。
3. 拖拽一张图到另一个位置 → 松开 → 图片顺序变化。
4. 调整行/列 → 网格列数变化。
5. 点「导出」→ PNG → 选保存路径 → 文件生成，拼接顺序与预览一致。
6. 拖拽后再导出 → 验证顺序变化反映在成品图中。
7. 取消保存对话框 → 不报错、弹窗不关。

Expected: 全部正常。
