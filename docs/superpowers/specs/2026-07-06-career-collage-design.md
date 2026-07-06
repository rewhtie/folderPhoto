# 职业游戏生涯拼图设计

## 目标

新增一个 tab 页面「职业游戏生涯拼图」：调用 Steam Web API 获取用户库中所有已游玩游戏及其时长，按个人库分位分档（XL/L/M/S）展示游戏封面，支持横版/竖版切换，可导出为 PNG 图片。

## 现状

- 应用已有 Steam Web API 集成：`settings.json` 存 `apiKey` + `steamId`，[achievementStore.ts](electron/achievementStore.ts) 有完整的 fetch + 缓存范式
- 应用当前是单页面（[App.vue](src/App.vue)），无 tab 导航
- 已有拼图导出能力：[CollageDialog.vue](src/components/CollageDialog.vue) + `collage:save` IPC，但那是用户手动选图拼图，与本功能不同
- 数据目录：portable 版存 exe 同级，安装版存 `userData/`，开发存项目根目录

## 架构

### Tab 导航

app 顶部加 tab 栏，两个 tab：
- 「图片浏览器」— 现有 [App.vue](src/App.vue) 主页
- 「职业游戏生涯拼图」— 新页面 `CareerCollage.vue`

tab 切换用本地 `ref` 状态，不引入路由库（YAGNI，两个 tab 不值得 vue-router）。

### 新模块 `electron/ownedGamesStore.ts`

- `fetchOwnedGames(apiKey, steamId)` — 调 `IPlayerService/GetOwnedGames/v1/`，返回 `{ appid, name, playtimeForever }[]`
- `loadCachedOwnedGames()` / `saveOwnedGamesCache()` — 缓存到 `<dataDir>/owned-games.json`，范式同 [achievementStore.ts](electron/achievementStore.ts)
- IPC handler `owned-games:fetch` — 先查缓存再走 API（同 `achievements:fetch-api` 套路）

### 封面加载

渲染器直接用 Steam CDN URL：
- 横版：`https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/header.jpg`（460×215）
- 竖版：`https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/library_600x900.jpg`（600×900）

不缓存到本地（CDN 公开稳定，省去下载逻辑）。封面加载失败显示带 appid 的占位灰块。

## 数据流

1. 用户切到「职业游戏生涯拼图」tab
2. `CareerCollage.vue` `onMounted` 调 `window.imageLibrary.fetchOwnedGames()`
3. preload 透传到 IPC `owned-games:fetch`
4. 主进程先查 `owned-games.json` 缓存 → 命中则秒返；未命中调 Steam API
5. 返回 `{ appid, name, playtimeForever }[]`
6. 渲染器过滤 `playtimeForever > 0`，按时长降序排序
7. 按百分位分档 → 渲染封面网格
8. 用户可点「刷新」强制重拉 API，或点「导出图片」生成 PNG

## 分档规则

获取所有 `playtimeForever > 0` 的游戏，按时长降序排序后，按排名百分位分档：

| 档位 | 百分位 | 含义 |
|---|---|---|
| XL | 前 10% | 玩得最多 |
| L | 10%~30% | 接下来 20% |
| M | 30%~60% | 接下来 30% |
| S | 60%~100% | 剩下 40% |

**边界处理**：
- 游戏数 < 10：至少每档 1 个（XL 取第 1 名，S 兜底）
- 游戏数 < 4：退化为统一大小（不分档）

## 每档尺寸

| 档位 | 横版 header（460×215） | 竖版 capsule（600×900） |
|---|---|---|
| XL | 220px 宽 | 130px 宽 |
| L | 160px 宽 | 95px 宽 |
| M | 120px 宽 | 70px 宽 |
| S | 80px 宽 | 48px 宽 |

## 布局

- 每档一个区块，档内 CSS flex wrap 排列，封面等大
- 档与档之间有间距 + 档位标签（如「XL · 前 10% · 共 N 个」）
- 档内按 playtime 降序
- 每张封面底部叠半透明条，显示游戏名（截断）+ 时长（如「32h」）
- 页面顶部 toggle 切横版/竖版，即时重排

## 导出 PNG

页面右上角「导出图片」按钮。**手动用 Canvas API 绘制**（不引入 html2canvas，避免跨域 CORS 污染）：

1. 创建离屏 canvas，按档位依次绘制
2. 每张封面 `fetch` 成 Blob → `createImageBitmap`（Steam CDN 带 CORS，渲染器 fetch 允许）→ `drawImage`
3. 绘制游戏名 + 时长文字
4. `canvas.toBlob` → 复用现有 `collage:save` IPC 保存（带保存对话框）

## 边界处理

- API key/steamId 未配置 → 显示「请先在设置中配置 Steam Web API」+ 按钮跳转设置
- API 请求失败 → 显示错误信息 + 重试按钮
- 0 个游玩游戏 → 空状态卡片
- 加载中 → 进度提示
- 封面加载失败 → 显示带 appid 的占位灰块（不中断整张图）

## 缓存策略

- `owned-games.json` 缓存到 `<dataDir>/`，首次加载秒开
- 页面提供「刷新」按钮强制重新拉 API（更新时长）

## 性能

游戏数可能几百个：
- 封面 `loading="lazy"` 懒加载
- 用 `IntersectionObserver` 只渲染视口内档位的 DOM
- 导出时再全量绘制到 canvas

## 改动文件清单

| 文件 | 改动 |
|---|---|
| `electron/ownedGamesStore.ts` | 新建：API 调用 + 缓存 |
| `electron/main.ts` | 新增 `owned-games:fetch` IPC handler + `setOwnedGamesCacheBaseDir` |
| `electron/preload.cts` | 新增 `fetchOwnedGames` 暴露 |
| `src/App.vue` | 加 tab 栏，条件渲染现有页面 / `CareerCollage` |
| `src/components/CareerCollage.vue` | 新建：拼图页面 |
| `src/shared/ownedGames.ts` | 新建：类型定义（`OwnedGame` 等） |

## 不改动的部分

- 现有图片浏览器功能不受影响
- 成就相关逻辑不受影响
- `collage:save` IPC 复用，不改

## 验证方式

1. 配置好 `apiKey` + `steamId`，切到「职业游戏生涯拼图」tab
2. 确认游戏列表加载、按时长分档显示
3. 切换横版/竖版，确认布局即时重排
4. 点「导出图片」，确认生成 PNG 且封面/文字正确
5. 关闭重开 app，确认缓存秒开
6. 点「刷新」，确认重新拉取 API
