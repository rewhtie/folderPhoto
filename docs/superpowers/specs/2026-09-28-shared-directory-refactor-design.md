# Shared 目录与 GameReview 逻辑重构设计

## 背景

`src/shared` 当前将业务模型、存储、纯算法、应用基础能力和跨进程契约平铺在同一层。文件数量增长后，调用方难以判断模块属于哪个功能，也难以区分功能私有代码与真正的公共代码。

`GameReview.vue` 同时承担页面编排、Vue 状态、DOM 交互和大量纯业务规则。该组件需要保留界面职责，并将稳定的数据规则迁入 `shared/game-review`。

## 目标

1. 按功能域组织全部 `src/shared` 文件。
2. 将真正跨功能复用的基础能力归入 `shared/common`。
3. 将 `GameReview.vue` 中的纯业务逻辑和稳定配置迁入 `shared/game-review`。
4. 保持页面行为、样式、存储格式、备份格式、文案和 Electron 接口不变。
5. 使用具体模块路径导入，不创建 `index.ts` 聚合入口。

## 非目标

- 不重写 Vue 组件状态管理。
- 不为了减少组件行数而迁移 DOM 或响应式交互逻辑。
- 不新增依赖或抽象框架。
- 不修改游戏类型配色、页面布局或其他视觉行为。
- 不修改 localStorage key、备份格式版本或游戏类型稳定 ID。

## 目录结构

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

## 边界规则

### Common

`common` 只包含应用级基础能力和跨功能依赖：

- `contracts/image-library.ts`：渲染层与 Electron 图片扫描共享的数据契约。
- `contracts/owned-games.ts`：渲染层与 Electron Steam 库共享的数据契约。
- `format.ts`：被多个界面使用的无业务格式化函数。
- `local-image-picker.ts`：被多个功能调用的本地图片选择适配器。
- `theme.ts`：应用级主题状态和持久化。

模块只有出现至少两个独立功能调用方时，才应提升到 `common`。不能因“未来可能复用”提前移动。

### 功能域

每个功能目录拥有自己的模型、规则、存储和测试。功能模块不能依赖 Vue 组件，也不能通过 `common` 隐藏业务依赖。

- `image-library`：图片库扫描配置。
- `collections`：收藏夹模型与不可变更新规则。
- `collage`：自由拼图布局算法。
- `career-collage`：生涯拼图分层规则。
- `tier-list`：Tier List 模型与移动规则。
- `review-rank`：浏览页与评测排行页之间的临时数据桥。
- `game-review`：游戏测评模型、类型目录、选择、格式化、排序、存储和备份。

## 现有文件迁移

| 当前文件 | 目标文件 |
|---|---|
| `shared/imageLibrary.ts` | `shared/common/contracts/image-library.ts` |
| `shared/ownedGames.ts` | `shared/common/contracts/owned-games.ts` |
| `shared/format.ts` | `shared/common/format.ts` |
| `shared/format.test.ts` | `shared/common/format.test.ts` |
| `shared/localImagePicker.ts` | `shared/common/local-image-picker.ts` |
| `shared/localImagePicker.test.ts` | `shared/common/local-image-picker.test.ts` |
| `shared/theme.ts` | `shared/common/theme.ts` |
| `shared/theme.test.ts` | `shared/common/theme.test.ts` |
| `shared/imageNameConfig.ts` | `shared/image-library/file-name-config.ts` |
| `shared/collections.ts` | `shared/collections/model.ts` |
| `shared/collections.test.ts` | `shared/collections/model.test.ts` |
| `shared/collage.ts` | `shared/collage/layout.ts` |
| `shared/collage.test.ts` | `shared/collage/layout.test.ts` |
| `shared/careerCollage.ts` | `shared/career-collage/tiers.ts` |
| `shared/careerCollage.test.ts` | `shared/career-collage/tiers.test.ts` |
| `shared/tierList.ts` | `shared/tier-list/model.ts` |
| `shared/tierList.test.ts` | `shared/tier-list/model.test.ts` |
| `shared/reviewPool.ts` | `shared/review-rank/pool.ts` |
| `shared/gameReview.ts` | `shared/game-review/selection.ts` 与 `model.ts` |
| `shared/gameReview.test.ts` | `shared/game-review/selection.test.ts` |
| `shared/gameReviewStorage.ts` | `shared/game-review/storage.ts` 与 `model.ts` |
| `shared/gameReviewStorage.test.ts` | `shared/game-review/storage.test.ts` |
| `shared/gameReviewBackup.ts` | `shared/game-review/backup.ts` |

## GameReview 逻辑拆分

### model.ts

集中定义：

- `GameReviewItem`
- `GameReviewDraft`
- `StoredGameReview`
- `StoredCustomGame`
- 与测评领域直接相关的稳定数据类型

其他 game-review 模块从 `model.ts` 导入类型，避免 `storage.ts` 成为领域类型的隐式所有者。

### catalog.ts

迁移游戏类型目录及兼容规则：

- `GameTypeDefinition`
- 稳定类型 ID 到 `label`、`color`、`aliases` 的配置
- 类型选项列表
- 类型旧值到稳定 ID 的转换
- 类型标签和颜色查询

该模块保持纯函数和静态数据，不读取 DOM 或 Vue 状态。已有类型 ID、标签、颜色和别名保持不变。

### selection.ts

保留从图片资产与已选路径生成 `GameReviewItem[]` 的规则。它依赖 `common/contracts/image-library.ts` 和 `model.ts`。

### formatting.ts

迁移不依赖组件状态的格式化规则：

- 游玩时长输入规范化
- Steam 分钟转小时文本
- 时长展示等级计算
- 推荐度 CSS 等级计算（若继续由字符串决定）

返回稳定值，不访问元素、事件或 CSSOM。

### order.ts

迁移纯排序计算。输入当前 ID 顺序、源 ID、目标 ID 和插入方向，返回新顺序。Pointer 事件和 DOM 命中检测继续留在组件。

### storage.ts

保留：

- localStorage key 和版本号
- 测评、排序和自定义游戏的读取与写入
- 损坏数据归一化
- 旧存储版本兼容
- 当前游戏与历史记录合并

所有 key、版本和序列化结构保持不变。

### backup.ts

保留 JSON 备份解析、校验、合并和创建。备份格式标识与版本保持不变。

## GameReview.vue 保留职责

以下逻辑依赖 Vue 生命周期、响应式状态或 DOM，应继续留在组件：

- `ref`、`reactive`、`computed` 和 `watch`
- 菜单开关、定位和 Teleport 状态
- Pointer 拖拽生命周期与 `elementFromPoint`
- textarea 高度测量和指令
- 图片资源等待、DOM 截图与文件保存
- 文件选择控件、导入导出提示和错误状态
- 组件 props、emit、分页状态和模板事件编排
- 与具体模板结构或 CSS 类直接绑定的状态

组件调用纯函数完成业务计算，但继续负责副作用和界面编排。

## 依赖方向

允许的依赖方向：

```text
components / App / electron
            ↓
      feature modules
            ↓
          common
```

约束：

- `common` 不导入任何功能域。
- 功能域不导入 Vue 组件。
- 功能域之间只有明确的领域协作才能直接依赖。
- 测试从同目录的具体模块导入。
- 不创建 barrel 文件。

## 导入更新范围

迁移必须覆盖：

- `src/App.vue`
- `src/components/*.vue`
- `src/env.d.ts`
- `electron/*.ts`
- `src/shared/**/*.test.ts`
- 新目录内模块之间的相对导入

Electron TypeScript 文件继续使用 `.js` 导入后缀，以保持当前编译和 ESM 约定。

## 迁移顺序

1. 创建 `common` 和各功能目录。
2. 移动无需拆分的模块及其测试。
3. 创建 `game-review/model.ts`，再拆分 selection、storage、backup、catalog、formatting 和 order。
4. 更新新模块内部依赖。
5. 更新 Vue、App、env 和 Electron 调用方的导入路径。
6. 全局搜索旧路径；确认无引用后删除旧平铺文件。
7. 检查 localStorage key、版本、备份格式和类型 ID 未改变。

移动过程中先保留旧文件，直到所有调用方切换完成，避免出现半迁移状态。

## 兼容策略

本次只改变源码组织，不改变运行时数据：

- localStorage key 不变。
- 存储版本与字段结构不变。
- JSON 备份格式、版本和文案不变。
- 游戏类型稳定 ID、标签、颜色和 aliases 不变。
- Electron IPC 载荷和全局类型不变。
- 对外导出函数名称尽量保持不变；仅导入路径变化。

## 验证约束

按用户要求，本次不运行测试、类型检查或构建。迁移结束后只执行静态全局搜索，确认：

- 没有导入旧的 `src/shared/*.ts` 路径。
- 没有模块引用已删除文件。
- Electron 导入仍包含 `.js` 后缀。
- 新目录不存在意外的跨层反向依赖。

## 完成标准

- `src/shared` 根目录不再平铺源文件。
- 所有模块位于 `common` 或明确的功能域目录。
- `GameReview.vue` 不再内嵌已列出的纯业务配置和计算规则。
- 页面行为、数据兼容性和接口保持不变。
- 所有调用方使用具体模块路径导入。
- 全局搜索未发现旧导入路径。
