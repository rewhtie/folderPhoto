# 游戏测评页结构与 UnoCSS 重构设计

## 背景

项目已接入 UnoCSS，但现有 Vue 页面仍主要依赖大段 scoped CSS。`GameReview.vue` 同时承担领域定义、草稿持久化、筛选、分页、拖拽、浮层定位、Steam 时长补全、截图导出和整表渲染，文件规模已影响维护与复用。

本设计是全项目样式与结构统一工作的第一阶段。第一阶段只重构游戏测评领域和 `GameReview` 页面，为后续处理 `App.vue` 与其他页面建立模式。

## 目标

- 严格保持现有视觉、交互、存储数据和导出结果。
- 将普通静态样式迁移到 UnoCSS utility。
- 将跨区域重复的稳定样式组合定义为 UnoCSS shortcuts。
- 将领域类型、常量和纯逻辑移出 Vue 页面。
- 将页面按职责拆为可理解、可测试的 composable 和展示组件。
- 保留当前未提交的封面模糊功能及其持久化行为。

## 非目标

- 不重新设计页面或调整现有视觉数值。
- 不在第一阶段重构 `App.vue`、拼图页、排行页、详情页或设置页。
- 不建立通用 UI 组件库。
- 不修改现有 localStorage 键或 Electron IPC 接口。
- 不以删除全部 scoped CSS 为目标。

## 模块边界

### 领域模块

`src/shared/gameReview.ts` 负责游戏测评领域定义和纯逻辑：

- `GameReviewItem` 与共享测评类型。
- 游戏类型定义、稳定 ID、显示名称、颜色和旧名称别名。
- 推荐等级定义及对应样式标识。
- 时长输入规范化、时长等级和 Steam 分钟数格式化。
- 默认草稿创建。

定义使用 `as const satisfies`，从数据派生 `GameTypeId`、`RecommendationGrade` 等联合类型，减少宽泛的 `string`。

`src/shared/gameReviewStorage.ts` 只负责：

- 存储格式和版本兼容。
- 草稿、历史测评和排序的读取与写入。
- 旧游戏类型名称向稳定 ID 的迁移。
- 无效字段归一化，包括 `coverBlurred` 的默认值。

### Composables

`src/composables/useGameReviewDrafts.ts` 负责：

- 根据当前游戏和历史记录初始化草稿。
- 同步已保存测评。
- 延迟保存与卸载前保存。
- Steam 游玩时长补全。
- 自定义游戏的创建、封面选择和删除。

`src/composables/useGameReviewFilters.ts` 负责：

- 名称、类型和推荐度筛选。
- 当前页、总页数、可见范围和每页数量。
- 筛选变化后的页码复位与边界修正。

`src/composables/useGameReviewReorder.ts` 负责：

- 指针拖拽状态和事件清理。
- 拖拽目标与插入方向计算。
- 顺序持久化。
- 向页面返回新的游戏顺序。

仅跨组件共享的类型从模块导出。局部类型保留在最接近使用处，不建立无明确职责的 `utils.ts` 或全局类型集合。

### Vue 组件

`GameReview.vue` 保留页面级职责：

- 接收 `games` 并发出 `reorder`。
- 组合 composables。
- 协调浮层状态。
- 执行整表图片导出。
- 向子组件传递 typed props 和 callbacks。

页面拆为以下视觉区域：

- `GameReviewFilters.vue`：名称、类型和推荐度筛选及统计。
- `GameReviewTable.vue`：表格结构、表头、导出容器和行列表。
- `GameReviewRow.vue`：单行编辑、封面模糊、评分、推荐度和删除操作。
- `GameReviewPagination.vue`：分页、范围和每页数量。

子组件不直接访问 localStorage、Electron bridge 或父组件内部状态。所有变化通过明确的 props、emits 或 callback props 传递。

## 数据流

1. `GameReview.vue` 接收所选游戏，并从存储模块加载历史测评和顺序。
2. 草稿 composable 合并当前游戏、自定义游戏和历史测评，维护每个 AppID 的草稿。
3. 筛选 composable 接收完整列表和草稿，产生筛选及分页结果。
4. 排序 composable 接收完整顺序，在拖拽结束时返回新顺序并持久化。
5. 页面把分页结果和编辑操作传给表格组件。
6. 行组件只修改传入草稿或发出语义事件，不执行存储和 IPC 操作。
7. 页面导出完整表格容器，并继续忽略带 `data-export-ignore="true"` 的控件。

## UnoCSS 策略

### 模板 utility

以下静态规则迁到模板 class：

- flex、grid、定位、对齐和换行。
- 宽高、间距和基础 overflow。
- 字号、字重、行高和文本对齐。
- 常规圆角、边框、透明度和光标。
- 简单的 hover、focus-visible、disabled 状态。

使用 arbitrary values 精确保留现有数值和 CSS 变量，例如 `bg-[var(--panel-background)]`。迁移不改变设计 token 或视觉尺寸。

### UnoCSS shortcuts

`uno.config.ts` 增加少量跨页面可复用组合。第一阶段只加入游戏测评页实际使用的组合，例如：

- `ui-panel`
- `ui-button`
- `ui-input`
- `ui-empty-state`
- `ui-focus-ring`

shortcut 表达稳定的跨组件模式，不为每个原 scoped 类创建一对一映射。

### 保留 scoped CSS

以下规则继续使用语义类和 scoped CSS：

- 表格首尾单元格圆角及 `nth-child` 结构关系。
- 顶级评分行和拖拽落点等跨子元素状态。
- SVG 皇冠、印章、彩虹文字和复杂阴影。
- 主题专用 `:global(:root[data-theme=...])` 覆盖。
- 截图导出的布局覆盖。
- 依赖父元素 hover 或 focus-within 的复杂显隐行为。
- 复杂动画、伪元素及不适合直接表达的响应式网格重排。

目标是让剩余 CSS 只描述关系型或特殊效果样式，而不是强制归零。

## 兼容性

- 保持现有 localStorage 键和存储版本读取能力。
- 旧类型名称如“养成经营”“SLG养成”和“箱体地图”继续映射到稳定类型 ID。
- 未知或损坏字段仍回退到安全默认值。
- `coverBlurred` 缺失或无效时回退为 `false`。
- 保持现有 props、`reorder` 事件和 Electron bridge 调用契约。
- 保持筛选、分页、拖拽、自动保存、图片导出和自定义游戏操作顺序。

## 错误处理

- localStorage 不可用或容量不足时，编辑继续保留在内存中。
- Steam 时长加载失败时，保留用户已有时长。
- 本地封面选择取消时，不修改当前封面。
- 图片导出失败时，继续通过页面现有错误区域提示。
- 子组件不吞掉业务错误；页面或 composable 在拥有恢复上下文的位置处理错误。

## 验证策略

### 自动化测试代码

- 为游戏类型规范化和旧名称兼容补充纯函数测试。
- 为推荐等级映射、时长规范化、时长等级和默认草稿补充测试。
- 调整存储测试，覆盖稳定类型 ID、旧数据迁移和 `coverBlurred` 默认值。
- 为可独立测试的排序和筛选纯函数补充输入输出测试。

### 行为核对

逐项核对重构前后的：

- 空状态和添加自定义游戏。
- 名称、类型和推荐度筛选。
- 分页及页码边界。
- 封面选择、拖拽排序和封面模糊。
- 游戏类型与推荐度浮层。
- 星级、时长和体验编辑。
- 自动保存、历史恢复和旧数据兼容。
- 图片导出内容和尺寸。
- 深色与浅色主题。
- 980px 与 720px 响应式断点。

按照项目既有偏好，实施后不自动运行测试、类型检查或构建。默认只执行 `git diff --check`，并明确报告未运行的验证。若用户另行授权，再运行针对性或完整验证命令。

## 实施阶段

第一阶段只包含：

1. 建立游戏测评领域类型与纯函数。
2. 调整存储兼容层及其测试代码。
3. 建立三个 composables。
4. 拆分筛选、表格行、表格和分页组件。
5. 引入第一批 UnoCSS shortcuts。
6. 将游戏测评页的普通静态样式迁到 UnoCSS。
7. 保留必要的 scoped CSS 和所有现有行为。

`App.vue` 和其他组件的统一改造留给后续阶段，并复用第一阶段验证过的模式。
