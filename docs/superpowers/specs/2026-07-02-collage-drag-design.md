# 拼图拖拽排序设计

## 目标

在 CollageDialog 拼图预览中支持拖拽排序：用户可以拖动图片在网格中的位置，实时看到排序效果，导出时按新顺序拼接。

## 方案

将 CollageDialog 的预览从 `<canvas>` 改为 DOM 网格（`<img>` + CSS grid），用 HTML5 原生拖拽 API 实现排序。导出仍用隐藏 Canvas + `computeLayout`。

## 数据流

1. 新增 `orderedIndices = ref<number[]>([])` — 当前图片顺序，存原始 URL 下标。`onMounted` 时初始化为 `[0, 1, ..., n-1]`。
2. DOM 预览：`<div class="collage-grid">` 内含 `<img v-for="idx in orderedIndices">`，每个 `<img>` 设 `draggable`，绑 `dragstart`/`dragover`/`drop` 事件。
3. 拖拽时从 `from` 位置移动到 `to` 位置（标准数组 splice 移动，中间元素前移/后移，不是简单交换）。
4. DOM 预览自动响应 `orderedIndices` 变化重排。
5. 导出时调用 `draw()`，按 `orderedIndices` 顺序构建 `filtered/imgs`，喂给 `computeLayout`，渲染到隐藏 Canvas，`toBlob` → `saveCollage`。
6. 参数变化（行/列/总宽）仍触发 `draw()`；`draw()` 内部按 `orderedIndices` 顺序取图。

## 不变的部分

- `computeLayout` 纯函数不变（src/shared/collage.ts）。
- IPC `collage:save` 不变。
- props `{ urls: string[] }`、emits `{ close: [] }` 不变。
- 导出流程不变（隐藏 canvas + toBlob + IPC）。
- 弹窗样式风格不变（深色卡片 #172033、圆角 18px、半透明遮罩）。

## DOM 预览样式

- 网格容器：`display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 4px`
- 每个 `<img>`：`aspect-ratio: 1; object-fit: cover; width: 100%; border-radius: 6px`
- 拖拽中：被拖元素加 `opacity: 0.4`；拖拽目标加高亮边框（如 `2px dashed #7dd3fc`）。
- 预览区限高 `max-height: 50vh; overflow-y: auto`。

## 移除的部分

- 移除原有 `<canvas ref="canvasRef">` 可见预览（保留隐藏 canvas 用于导出）。
- 移除 `watch([rows, cols, totalWidth], () => draw())` 中对可见预览的依赖；导出时才调用 `draw()`。
- `loadImages()` 不再在 `onMounted` 时调用（DOM `<img>` 自行加载，不需要预加载到 Map）。
- 可移除 `loadedImages` ref（DOM img 自行加载，导出时临时从 `<img>` 元素读取 `naturalWidth/naturalHeight` 并加载到临时 canvas）。

## 导出流程调整

导出时：
1. 根据 `orderedIndices` 按序从 DOM 预览的 `<img>` 元素取 `naturalWidth/naturalHeight` 构建 `imgs`（只读宽高给 computeLayout）。
2. 同时收集对应的 `HTMLImageElement` 引用。
3. 按 `orderedIndices` 顺序构建 `filtered`（与 `imgs` 锁步）。
4. 调用 `computeLayout(imgs, rows, cols, clampWidth(totalWidth))`。
5. 用隐藏 `<canvas>` 绘制并 `toBlob`。
6. 调用 `saveCollage`。

注意：DOM `<img>` 用 `crossOrigin='anonymous'` 加载（保持 CORS 修复），这样 hidden canvas 的 `drawImage` 不会污染。

## 测试

- `computeLayout` 不受影响（纯函数，已有 11 个测试）。
- 拖拽逻辑（数组移动）可抽成纯函数 `moveItem<T>(arr, from, to)` 并单测。
- DOM 交互本身不单测，手动验证。
