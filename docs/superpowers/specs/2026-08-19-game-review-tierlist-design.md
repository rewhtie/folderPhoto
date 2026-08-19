# 游戏评测排名（档位金字塔）设计

日期：2026-08-19
状态：待用户审阅

## 背景

复刻 B 站流行的「游戏评测 tier list / 金字塔」形式：用户导入自己挑选的游戏图片，手动拖拽将它们分到五档，从上到下排成金字塔（神作 → 烂作），并可导出一张成品 PNG。

五档命名（自上而下）：**夯 → 顶级 → 人上人 → NPC → 拉**，底部附带「待分区」区。

现有项目是 Electron + Vue 3 + TypeScript + UnoCSS 的 Steam 本地图片浏览器，已具备：

- 顶部 Tab 导航（`App.vue` 的 `activeTab`，目前有「图片浏览器」「职业游戏生涯拼图」，外加「自由拼图」弹窗）
- 本地图片扫描 + 选中（`ImageAsset.fileUrl` / `appName`）
- 本地图片导入（`window.imageLibrary.pickLocalImages()` 返回 `local-image://` URL 数组）
- JSON 逐文件持久化范式（`collections.json` → `electron/collectionsStore.ts` → `ipcMain.handle` → `preload.cts`）
- canvas 绘制 + `saveCollage` 导出 PNG（`CareerCollage.vue`）

本功能是全新子系统（新 Tab + 新存储 + 拖拽交互），按 architectural 处理。

## 目标与非目标

目标：

- 新增「游戏评测排名」Tab。
- 支持两种图片来源：文件选择器导入 + 浏览器页勾选送评测。
- 手动拖拽把游戏分到「夯 / 顶级 / 人上人 / NPC / 拉」五档，档内可排序，可拖回待分区。
- 持久化：重开后保留排位。
- 导出成品 PNG。

非目标（YAGNI）：

- 不做网络拉取 B 站榜单/他人评测，纯本地手动排。
- 不做分数自动落档、多套榜单管理。
- 不做拖拽排序的动画/触屏优化（桌面端 Electron，只走 HTML5 拖拽）。

## 数据模型

```ts
interface TierEntry {
  id: string      // 唯一键，用 src 去重
  src: string     // local-image:// 或文件 URL
  label: string   // 游戏名（浏览器页 appName，文件选择器用文件名兜底）
}

interface TierList {
  夯: TierEntry[]
  顶级: TierEntry[]
  人上人: TierEntry[]
  NPC: TierEntry[]
  拉: TierEntry[]
  pool: TierEntry[]   // 待分区
}
```

档位键固定为 `夯 / 顶级 / 人上人 / NPC / 拉 / pool`，数组内顺序即排名顺序。档位显示顺序（金字塔自上而下）用一个常量数组 `TIER_ORDER = ['夯', '顶级', '人上人', 'NPC', '拉']` 定义，键与显示文案同名。文件选择器导入的图片 `label` 取文件名（去扩展名）；浏览器页勾选的取 `appName`（无则回退文件名）。

## 架构与组件

- `App.vue`：`activeTab` 增加 `'review'`，`tab-bar` 增加「游戏评测排名」按钮，渲染 `<ReviewRank />`。`selection-bar` 增加「加入评测」按钮，把选中图写入 `reviewPool` 共享模块。
- `src/components/ReviewRank.vue`：核心页面。
  - 顶部 control 区：导入图片、导出 PNG。
  - 金字塔区：「夯 → 顶级 → 人上人 → NPC → 拉」五个档位块，底部「待分区」块；每块一行横向滚动封面，档位间留白（上方少/大图，下方多/小图）。
  - 载入时 `tierList:load`，变更时 `tierList:save`（去抖）。
  - HTML5 拖拽：从 `pool`/档位拖到另一档位末尾；档内拖动换序；拖回 `pool` 取消评级。
- `src/shared/tierList.ts`：纯函数 `moveEntry(list, fromTier, fromIdx, toTier)`、`dedupeEntry` 等，配单测。
- `src/shared/reviewPool.ts`：`reactive` 数组作为浏览器页与评测页的桥（避免 prop 层层传）。
- `electron/tierListStore.ts`：`loadTierList` / `saveTierList`，读写 `tierList.json`（沿用 `collectionsStore.ts` 的 `setTierListFilePath` 注入路径模式）。
- `main.ts`：新增 `ipcMain.handle('tier-list:load')` / `'tier-list:save'`，`setTierListFilePath(join(collectionsDirectory, 'tierList.json'))`。
- `preload.cts`：暴露 `loadTierList()` / `saveTierList(list)`。

## 数据流

浏览器页选中 → `reviewPool`（共享 reactive 数组）→ 评测页读取为待分区 → 拖到档位 → 更新本地 `TierList` state → `tierList:save` → 写 `tierList.json`。

## 交互细节

- 拖拽实现复用 `CollageDialog.vue` 的 `dragstart/dragover/drop/dragend` 模式：`dragFrom` 记录「源档位 + 下标」，`drop` 时 `moveEntry` 重建状态，不持有 DOM 引用。
- 每个封面 `<img>` 不需要 `crossOrigin` 也可以正常展示（`local-image` 协议已 `corsEnabled`），导出前再走 `createImageBitmap(fetch(src))` 获取位图，与 `CareerCollage.vue` 的 `loadBitmap` 一致。
- 去重：同一 `src` 只保留一份，`pool` 与档位内不重复。

## 导出

- 复用 `CareerCollage.vue` 的 `exportPng` 结构：canvas 宽 1920，逐档向下绘制——档位标签色条（夯=天蓝 … 拉=红）+ 该档封面横排，图宽按档位递减（夯最大、拉最小），底部文字条显示 `label`。`saveCollage` 落盘。
- 文字标签色沿用本项目的配色令牌（`#7dd3fc` 等）。

## 错误处理

- `tierList:load` 解析失败 → 返回空 `TierList`（不崩）。
- 导出无内容 → 按钮禁用。
- 文件选择器取消 → 静默返回。

## 测试

- `src/shared/tierList.test.ts`：`moveEntry`（跨档、档内、拖回 pool）、`dedupeEntry`、空列表边界。沿用 vitest。

## 交付文件清单

- 新增：`src/components/ReviewRank.vue`、`src/shared/tierList.ts`、`src/shared/tierList.test.ts`、`src/shared/reviewPool.ts`、`electron/tierListStore.ts`
- 修改：`src/App.vue`、`electron/main.ts`、`electron/preload.cts`、`src/env.d.ts`（补 preload 类型）