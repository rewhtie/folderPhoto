# 游戏详情页 + 成就功能设计

## 目标

为每个游戏提供详情页（页面内切换），展示该游戏的图片和成就。成就按需加载，本地能查到就显示，查不到提示配置 Web API。设置通过顶栏齿轮按钮管理。

## 入口

- 图片卡片 hover 时显示「详情」按钮（右上角小图标）。
- 点击 → 主界面切换到该游戏详情视图。单击选中行为不变。
- 详情视图顶栏：游戏名 + 返回按钮（点返回回全量列表）。

## 详情视图

### 上半部分：游戏图片
- 该游戏的所有图片（library_hero、header、capsule 等，即现有按 groupName 分组里的同组图片）。
- 行为不变：可选中、下载、拼图、加入收藏夹。

### 下半部分：成就区
- 「加载成就」按钮（按需触发，不自动扫描）。
- 点击后逻辑：
  1. 已配置 Web API（settings 里有 key + steamid）→ 调 API 拿成就名称、描述、图标 URL、解锁状态。图标从 CDN (`https://`) 加载，显示富网格。
  2. 未配置 → 扫 `userdata/<account>/stats/UserGameStats_<appid>.json`：
     - 找到 → 显示有限视图（内部 ID + ✓/✗ 解锁状态），提示「配置 Web API 可显示图标和名称」。
     - 没找到 → 显示「需要配置 Web API 获取成就」+ 设置入口。

## 设置

- 顶栏齿轮按钮 → 设置弹窗。
- 字段：Steam Web API key、steamid。
- 持久化到 `<exe同级>/settings.json`（沿用 collectionsStore 模式）。
- IPC：`settings:load` / `settings:save`。

## 数据来源

### 本地文件
- `userdata/<account>/stats/UserGameStats_<appid>.json`
- 只有内部 ID（如 `ACH_WIN_100_ROUNDS`）+ earned/earned_time，无名称无图标。
- 多账号：遍历 userdata 下所有 account 目录。

### Steam Web API
- `ISteamUserStats/GetPlayerAchievements/v1/?key=xxx&steamid=xxx&appid=xxx`
- 主进程发请求（避免在渲染进程暴露 key），返回结构化成就数组。
- 图标 URL：`http://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/<appid>/<iconhash>.jpg`
- 渲染进程直接 `<img src="https://...">` 加载（Chromium 原生支持 https）。

## 成就图标与 Canvas（拼图）

- 成就图标是 `https://` URL。拼图导出需 `crossOrigin='anonymous'` + CDN 返回 CORS 头。
- Steam 社区 CDN 一般支持 CORS。若不支持，拼图时该图污染 canvas → toBlob 失败。
- 成就图片同样支持下载/拼图（沿用现有选中机制）。

## 文件结构

| 文件 | 职责 |
|---|---|
| `electron/settingsStore.ts` | 新建。load/save settings.json（key + steamid）。 |
| `electron/achievementStore.ts` | 新建。`loadLocalAchievements(appId)` 扫 userdata stats；`fetchApiAchievements(appId, key, steamid)` 调 Web API。 |
| `electron/main.ts` | 新增 IPC：`settings:load/save`、`achievements:load-local`、`achievements:fetch-api`。 |
| `electron/preload.cts` | 暴露 `loadSettings`、`saveSettings`、`loadLocalAchievements`、`fetchApiAchievements`。 |
| `src/env.d.ts` | 补类型。 |
| `src/components/GameDetail.vue` | 新建。详情视图组件。props: `appId`、`appName`、`images`。 |
| `src/components/SettingsDialog.vue` | 新建。设置弹窗。 |
| `src/App.vue` | 加齿轮按钮、详情视图切换逻辑、详情按钮。 |

## 非目标

- 不在主扫描时拉取成就（仅详情页按需）。
- 不缓存成就图标到本地（直接 CDN 加载）。
- 不做成就进度统计/排行榜。
- 不重构现有主界面布局（只加详情切换层）。
