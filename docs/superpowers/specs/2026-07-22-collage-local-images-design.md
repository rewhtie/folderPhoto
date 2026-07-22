# 拼图模态导入本地图片 — 设计

## 背景

现有拼图流程：图片浏览器勾选已扫描的 librarycache 图片 → 点「拼图」→ `CollageDialog` 接收这些图的 `fileUrl`（`local-image://` 协议）做布局、拖拽、导出 PNG/JPG。

用户希望能在拼图模态里直接加入任意本地图片文件，不必先把它们扫描进库。

## 范围

只在拼图模态（`CollageDialog.vue`）内新增一个「导入本地图片」入口，通过系统文件多选框选图。不与已扫描库联动：本地图片只在模态生命周期内有效，关闭即清空，不写盘、不进收藏夹。

非目标：移除单张按钮、文件夹批量扫描、本地图片持久化、与收藏夹交互。

## 方案

复用现有 `local-image://` 协议承载本地图片，使其与已扫描图在 CORS、`crossOrigin="anonymous"`、canvas 导出上行为完全一致——零特例。

### 数据流

1. **新增 IPC** `collage:pick-local-images`（[electron/main.ts](electron/main.ts)）：
   - `dialog.showOpenDialog({ title: '选择本地图片', properties: ['openFile', 'multiSelections'], filters: [{ name: '图片', extensions: ['jpg','jpeg','png','webp','gif','bmp'] }] })`
   - 取消或未选 → 返回 `null`。
   - 选中 → 用 `toImageSourceUrl(absolutePath)` 把每个绝对路径转成 `local-image://file/<encoded>`，返回 `string[]`。

2. **preload** ([electron/preload.cts](electron/preload.cts)) 暴露：
   ```ts
   pickLocalImages(): Promise<string[] | null>
   ```

3. **CollageDialog** ([src/components/CollageDialog.vue](src/components/CollageDialog.vue))：
   - 新增 `localUrls = ref<string[]>([])`。
   - `allUrls = computed(() => [...props.urls, ...localUrls.value])`，模板 `<img :src="allUrls[idx]">`、`n`、`defaultRows/Cols`、`draw()`、`exportCollage()` 全部改用 `allUrls`。
   - `orderedIndices` 初始仍 `Array.from({length: n}, …)`；`watch(allUrls)` 在长度增长时把新下标追加到 `orderedIndices` 末尾（不动已有顺序）。
   - 顶部新增「导入本地图片」按钮，点击 → `await window.imageLibrary.pickLocalImages()` → 若非空 `localUrls.value.push(...)`。

### 关键点

- **协议一致**：本地图与已扫描图同为 `local-image://`，`corsEnabled: true` 已注册（[main.ts:55](electron/main.ts#L55)），canvas 导出不会被污染。
- **生命周期**：`localUrls` 仅存在于模态内，关闭模态（组件卸载）即丢弃。
- **扩展名白名单**：与扫描器 `IMAGE_EXTENSIONS`（[imageScanner.ts:11](electron/imageScanner.ts#L11)）保持一致：jpg/jpeg/png/webp/gif/bmp。
- **顺序**：导入的新图追加到末尾；用户可用现有拖拽功能调整位置。

## 错误处理

- 文件对话框取消 → 无操作（返回 `null`，按钮无反应）。
- 选中的文件不可读 → `local-image://` 协议 handler 已有 `net.fetch` 失败处理，图片 `@error` 时该 `<img>` 不进 `draw()`（现有逻辑 `img.complete && naturalWidth > 0` 过滤），导出时该格留空，不中断。

## 测试

- 手动：无已选扫描图时打开拼图（需放宽 `openCollageDialog` 的 `size === 0` 前置校验？见下）→ 导入几张本地图 → 调行列 → 导出，验证 PNG 含全部本地图。
- 混合：先选若干扫描图打开拼图 → 再导入本地图 → 验证两类图都渲染并可拖拽。
- 取消对话框 → 无变化。

## 前置校验

`openCollageDialog`（[App.vue:48](src/App.vue#L48)）的 `if (selectedPaths.value.size === 0) return` 保持不变——本地图片只能作为已选扫描图的补充，至少选 1 张扫描图才能进拼图模态。`CollageDialog` 内 `n` 始终 ≥ 1，无需空状态分支。
