# 拼图功能设计

## 目标

将多张本地图片按用户指定的「行 × 列」网格拼接成一张图，导出为 PNG/JPG。
用户在主界面多选图片后点「拼图」按钮，弹出模态编辑器，可调行列、总宽、格式，实时预览，导出到本地。

## 入口

- 在「下载选中」按钮旁新增「拼图」按钮，仅当 `selectedPaths.size > 0` 时可见。
- 点击打开模态弹窗 `CollageDialog`，与现有收藏夹弹窗同一套模态模式。

## 数据流

1. 主界面已有 `selectedPaths`（选中图片绝对路径集合）。
2. 点「拼图」→ 打开模态，传入 `paths`。
3. 模态内通过 `local-image://` 协议把每张图加载为 `HTMLImageElement`。
4. 用户调参（行、列、总宽、格式、JPG 质量）→ `watch` 重绘 Canvas 预览。
5. 点「导出」→ `canvas.toBlob` → 调新 IPC `collage:save` 写文件。
6. 关闭弹窗。

## 合成位置

渲染进程 Canvas。零原生依赖，不影响 portable exe 打包。

## 布局算法（纯函数 `computeLayout`，放 `src/shared/collage.ts`）

输入：已加载图片数组 `images`、`rows`、`cols`、`totalWidth`。

1. `cellW = totalWidth / cols`
2. `aspect = dominantAspectRatio(images)`：把每张图的 `width/height` 按 0.01 精度分桶取众数；数组为空时默认 `1`（正方形）。
3. `cellH = cellW / aspect`
4. `canvasWidth = totalWidth`，`canvasHeight = cellH * rows`
5. 遍历 `rows × cols`，第 i 格取 `images[i]`：
   - 格子多于图：多余格留空（不绘制）。
   - 图多于格子：多余图忽略。
6. 每格 cover 居中裁剪：按 `img` 与 cell 比例算 source 裁剪框 `sx,sy,sw,sh`，`drawImage` 缩放到 `dx,dy,dw,dh`。

输出对象：

```ts
interface CollageDraw {
  img: HTMLImageElement
  sx: number; sy: number; sw: number; sh: number
  dx: number; dy: number; dw: number; dh: number
}
interface CollageLayout {
  canvasWidth: number
  canvasHeight: number
  cellW: number
  cellH: number
  draws: CollageDraw[]
}
```

## UI 参数与默认值

- 行 `rows`：默认 `ceil(sqrt(n))`，n 为选中张数。
- 列 `cols`：默认 `ceil(n / rows)`，使初始网格尽量接近正方形。
- 总宽 `totalWidth`：默认 2048，范围 [256, 8192]。
- 格式：默认 PNG；可选 JPG；选 JPG 时显示质量滑块（默认 0.92，范围 [0.5, 1]）。
- 无格子间隔，无外边距。
- 预览 Canvas 用 CSS 限制最大显示高度，保留原始分辨率数据。

## 文件 / 改动

| 文件 | 改动 |
|---|---|
| `src/shared/collage.ts` | 新建。`computeLayout`、`dominantAspectRatio` 等纯函数，渲染无关，可单测。 |
| `src/components/CollageDialog.vue` | 新建。模态组件：props `paths: string[]`，emits `close`。含参数输入、Canvas 预览、导出逻辑。把拼图 UI 从 App.vue 隔离。 |
| `electron/main.ts` | 新增 IPC `collage:save`：`dialog.showSaveDialog` 选保存路径，写 ArrayBuffer 到磁盘。 |
| `electron/preload.cts` | 暴露 `saveCollage(buffer: ArrayBuffer, suggestedName: string): Promise<string | null>`。 |
| `src/env.d.ts` | 补 `saveCollage` 类型到 `window.imageLibrary`。 |
| `src/App.vue` | 加「拼图」按钮、`isCollageDialogOpen` ref、渲染 `<CollageDialog>`。 |

## 错误处理

- 单张图加载失败：该格留空，不阻塞整体。
- 0 张选中：按钮禁用。
- `toBlob` 失败：toast 提示「导出失败」。
- 写文件失败：toast 提示。
- 用户在保存对话框取消：静默返回，不报错。

## 测试

- `src/shared/collage.test.ts`：
  - cover 裁剪框计算（横图、竖图、正方图）。
  - `dominantAspectRatio` 众数选取。
  - 容错：格子多于图（draws 长度 = min(n, rows*cols)）；图多于格子。
  - `totalWidth` 边界（256、8192）。
  - 与现有 `imageScanner.test.ts` 同风格，纯函数，不碰 DOM。
- Canvas 绘制与导出属渲染/IO，不单测，手动验证。

## 非目标

- 不做拖拽排序、旋转、缩放、滤镜。
- 不做格子间隔/背景色/边框。
- 不做不规则布局。
- 不重构现有导出（`exportImages` 仍是文件复制，与本功能并存）。
