# Tauri 完整 DesktopApi 后端迁移设计

## 背景

当前仓库已经完成 Tauri Windows preview 的首阶段转换。Vue 前端通过统一的 `DesktopApi` 同时支持 Electron preload 和 Tauri 适配器；Tauri 已实现图片扫描、受控本地图片访问、收藏夹持久化、本地图片选择和拼图保存。

`DesktopApi` 中仍有以下 Tauri 占位实现：

- 设置读取与保存
- Owned Games 与游戏生涯数据
- 成就 API、成就缓存和缓存目录打开
- Tier List 持久化
- Steam Collections 读取
- 图片批量导出

本阶段一次迁移这些剩余能力。Electron 继续作为稳定后端，Tauri 仍使用 preview 标识和独立数据目录。

## 目标

1. 为当前 `DesktopApi` 的全部方法提供真实 Tauri 实现。
2. 保留现有 Vue 调用点和 `DesktopApi` 方法签名。
3. 将 Steam API 请求、缓存编排和本地 Steam 数据合并放在 Rust 后端。
4. 继续隔离 Tauri preview 与 Electron 的设置、缓存和业务数据。
5. 复刻 Electron 当前可观察行为，包括默认值、错误结构、缓存优先级和批处理统计。
6. 对本地读取、图片缓存和批量导出实施受控路径授权。
7. 保留 Electron preload、IPC、开发、打包和发布流程。

## 非目标

本阶段不包含：

- Electron 数据自动导入或共享
- Tauri 正式应用标识切换
- Tauri 安装包、签名或发布脚本接入
- 删除 Electron 代码或依赖
- 修改 Vue 页面结构或交互
- macOS 或 Linux 支持
- 使用系统密钥链保存 Steam API Key
- 持久化最近扫描的 Steam 路径

## 总体架构

继续使用现有双后端边界：

```text
Vue components
      ↓
DesktopApi
  ↙       ↘
Electron   Tauri adapter
preload      ↓
          Rust commands
              ↓
     domain modules + storage
```

Tauri 适配器保持轻量，只负责：

- 调用 Rust commands
- 为目录扫描、本地选图和拼图保存打开 Tauri 原生对话框
- 将 Rust 返回的本地路径转换为受控协议 URL
- 保持 `DesktopApi` 的参数和返回结构

Rust 后端按职责拆分：

```text
src-tauri/src/
├─ commands/
│  ├─ settings.rs
│  ├─ owned_games.rs
│  ├─ achievements.rs
│  ├─ tier_list.rs
│  ├─ steam_collections.rs
│  └─ image_export.rs
├─ storage/
│  └─ mod.rs
├─ steam/
│  ├─ app_info.rs
│  ├─ manifest.rs
│  ├─ local_config.rs
│  └─ collections.rs
├─ protocol/
│  └─ local_image.rs
└─ lib.rs
```

命令层接收参数并返回 `Result<T, String>`。纯解析、合并和验证逻辑放在独立函数中，便于单元测试。

## 共享运行状态

新增 `AppState` 作为唯一的 Tauri 托管状态。`AppState` 内含现有 `LocalImageAccess`，并以同步锁保护其余会话状态。它在当前进程中保存：

- 已授权图片根目录
- 用户明确选择的已授权图片文件
- 最近一次成功扫描的 canonical librarycache 目录
- 用户通过目录选择器确认的导出目标目录

最近扫描路径只在当前进程有效，不写入磁盘。Owned Games 和 Steam Collections 优先使用该路径；没有记录时回退：

```text
C:\Program Files (x86)\Steam\appcache\librarycache
```

成功扫描后才更新最近路径。无效或失败的扫描不得覆盖已有路径。

## 数据目录与存储

所有 Tauri 数据继续写入 preview 标识 `com.steampc.imagebrowser-tauri-preview` 对应的 `app_data_dir()`：

```text
settings.json
collections.json
tierList.json
owned-games.json
achievements/
├─ <appId>.json
└─ <appId>_<sanitized-game-name>/
   ├─ <achievement-id>.<ext>
   └─ <achievement-id>_gray.<ext>
```

新增统一 storage 帮助函数以：

- 解析应用数据目录和子路径
- 创建父目录
- 读取 JSON
- 写入格式化 UTF-8 JSON

Tauri 不读取或覆盖以下 Electron 数据位置：

- 项目根目录中的开发数据
- Electron `userData`
- 便携版可执行文件旁的数据

## 设置与 Steam API 凭据

### 数据结构

```rust
struct SteamSettings {
    api_key: String,
    steam_id: String,
}
```

通过 Serde camelCase 与前端的 `apiKey`、`steamId` 对齐。

### load_settings

- 读取 `settings.json`。
- 文件不存在、不可读、JSON 损坏或字段类型无效时返回两个空字符串。
- 不把文件内容或 API Key写入日志和错误消息。

### save_settings

- 只接受两个字符串字段。
- 使用格式化 UTF-8 JSON 保存。
- 创建目录或写入失败时返回明确错误。

本阶段复刻 Electron 的普通 JSON 存储方式，不引入系统密钥链。

## Steam HTTP 客户端

Steam API 请求在 Rust 后端完成。前端不获得 HTTP plugin 权限，也不直接拼接带 API Key 的 URL。

后端使用支持 HTTPS 和 JSON 的 Rust HTTP 客户端。请求参数采用 URL 查询参数编码，设置合理的连接与总请求超时。只允许代码中定义的 Steam HTTPS endpoint；不接受前端提供的任意 URL。

错误映射规则：

- 非 2xx：`Steam API 请求失败：HTTP <status>`
- Steam 业务响应失败：返回 Steam 的错误文本；缺失时返回 `Steam API 返回失败`
- 传输或 JSON 解析失败：返回不含 API Key 的简明错误

API Key 不进入文件名、缓存键或日志。

## Owned Games

### 命令

```text
fetch_owned_games(force?: bool) -> OwnedGamesResult
```

返回结构保持：

```ts
interface OwnedGamesResult {
  games: OwnedGame[]
  error?: string
}
```

### 缓存优先流程

当 `force` 为 false：

1. 尝试读取 `owned-games.json`。
2. 严格验证每项的 `appid`、`name`、`playtimeForever` 和可选 `isFamily`。
3. 缓存有效时，读取本地 `localconfig.vdf` 补充缺失的游玩时长。
4. 保存合并后的缓存并返回。

缓存不存在、无效或 `force` 为 true 时进入刷新流程。

### 刷新流程

1. 加载 Tauri settings。
2. 缺少 API Key 或 Steam ID 时返回 `{ games: [], error: "未配置 Web API" }`。
3. 并发执行：
   - `IPlayerService/GetOwnedGames/v1/`
   - `IPlayerService/GetRecentlyPlayedGames/v1/`
   - 扫描 librarycache 的数字 AppID 目录
   - 加载现有 Rust appinfo 数据
   - 解析对应账号的 `localconfig.vdf`
4. 将 API 游戏与 librarycache 游戏合并。
5. 使用 appinfo 排除 DLC，并为家庭共享游戏补充名称。
6. 游戏时长优先级为：API 非零时长，其次 Recently Played，最后本地 `localconfig.vdf`。
7. 成功时写入 `owned-games.json` 并返回。
8. API 失败时返回 `{ games: [], error }`，不覆盖有效缓存。

### Steam ID 与本地时长

Steam Account ID 按现有公式计算：

```text
SteamID64 - 76561197960265728
```

仅接受 17 位数字和 `u32` 范围内结果。本地时长从：

```text
<Steam root>/userdata/<accountId>/config/localconfig.vdf
```

的 `apps` 块读取 `Playtime`。文件缺失或损坏时返回空映射，不中断 API 数据。

## 成就

### fetch_api_achievements

流程保持 Electron 当前语义：

1. 优先读取 `achievements/<appId>.json`。
2. 有有效缓存时直接返回。
3. 缺少 API 配置时返回：

```json
{
  "source": "api",
  "achievements": [],
  "error": "未配置 Web API"
}
```

4. 并发请求：
   - `ISteamUserStats/GetPlayerAchievements/v1/`，语言为简体中文
   - `ISteamUserStats/GetSchemaForGame/v2/`
5. 按 API name 合并解锁状态、名称、描述和图标。
6. 名称与描述优先使用玩家成就响应，缺失时使用 Schema。
7. Schema 请求失败时允许返回没有图标的玩家成就。
8. 结果非空时保存缓存。
9. 请求失败时以现有返回结构携带 `error`，不抛出页面无法处理的结构。

缓存读取必须验证 `source` 和成就数组的字段类型。损坏缓存按未命中处理。

### cache_achievement_icons

- 目录名为 `<appId>_<sanitized-game-name>`。
- 游戏名和成就 ID中的 Windows 非法字符、路径分隔符、控制字符及 `.`/`..` 特殊值必须净化。
- 只下载代码从 Steam Schema 返回或前端提交的有效 HTTPS URL。
- 扩展名只接受 `.jpg`、`.jpeg`、`.png`、`.webp`、`.gif`；其他格式使用 `.jpg`。
- 已存在文件计入 `skipped`。
- 下载成功计入 `cached`。
- 非 2xx、传输失败或写入失败计入 `failed`。
- 单个失败不终止其余下载。
- 返回实际 canonical 缓存目录及统计。

### open_achievement_cache_dir

- 由后端按 appId 和净化后的游戏名构造路径。
- 必要时先创建目录。
- 使用官方 `tauri-plugin-opener` 的 Rust API打开目录。
- 不接收前端提供的任意目录，不启用 shell 权限。

## Tier List

### 数据结构

固定保留六个分组：

- `夯`
- `顶级`
- `人上人`
- `NPC`
- `拉`
- `pool`

每项必须包含字符串 `id`、`src` 和 `label`；`appId` 若存在也必须为字符串。

### load_tier_list

- 文件缺失、不可读或顶层结构无效时返回六个空分组。
- 每个合法分组独立规范化。
- 非数组分组变为空数组。
- 丢弃字段无效的单项，而不是使整个文件失效。
- 忽略未知顶层键。

### save_tier_list

- 验证并规范化输入后保存格式化 JSON。
- 不允许任意额外结构写入文件。

### 本地图片 URL

Tier List 可保存受控协议 URL，但加载文件本身不授予磁盘读取权限。只有以下图片可被协议读取：

- 位于当前进程最近成功扫描根目录内的图片；
- 当前进程中由图片选择器明确授权的文件。

应用重启后，用户可能需要重新扫描原目录，持久化 Tier List 中的本地图片才会恢复显示。后端不得仅根据 `tierList.json` 中的字符串授权任意磁盘路径。

## Steam Collections

### load_steam_collections

保持现有 `DesktopApi` 参数，以调用方传入的 `librarycacheDir` 为首选路径。后端执行以下检查：

1. 去除首尾空白并 canonicalize。
2. 确认路径是目录。
3. 路径必须等于最近成功扫描的根目录，或位于应用使用的默认 Steam librarycache 路径；未经扫描授权的任意路径不得用于遍历 userdata。
4. 从 librarycache 向上两级推导 Steam 根目录。
5. 遍历 `userdata/<account>/config/cloudstorage/cloud-storage-namespace-1.json`。

只处理 key 以 `user-collections.` 开头的 `[key, value]` 条目。`value.value` 必须是 JSON 字符串，其中：

- `name` 必须是非空字符串；
- `added` 必须是数组；
- 只保留数字 AppID并转为字符串；
- 跳过 `user-collections.hidden`。

单个账号文件或条目损坏时忽略。多账号结果保持 Electron 当前行为，不主动去重。整个 userdata 不可读时返回空数组。

## 图片批量导出

### choose_export_directory

前端直接调用 Rust command。该 command 使用 Tauri dialog plugin 的 Rust API打开单选目录对话框，使“用户选择”和“授权登记”位于同一可信后端操作中。取消时返回 `null`。选中后：

1. 目录不存在时创建目录。
2. canonicalize 所选目录。
3. 将 canonical 路径保存在当前进程的导出授权集合中。
4. 将 canonical 路径返回前端。

后端不提供可由前端传入任意路径的“授权导出目录”command。

### export_images

命令只允许：

- 读取当前 `LocalImageAccess` 已授权的源文件；
- 写入通过目录选择器登记的目标目录。

源文件和目标目录均在 canonicalize 后检查。未授权输入使整个命令失败，不把它降级为普通单文件复制失败。

命名和批处理行为保持 Electron 当前实现：

1. 从源路径中寻找首个纯数字段作为文件名。
2. 找不到时使用父目录名，再回退为 `image`。
3. 保留源扩展名。
4. 同一批次重名时依次追加 `_1`、`_2`。
5. 目标文件已存在时计入 `skipped`，不覆盖。
6. 单文件复制失败时把源路径加入 `failed`，继续处理其余文件。
7. 成功复制计入 `copied`。

返回结构保持：

```ts
interface ExportResult {
  copied: number
  skipped: number
  failed: string[]
}
```

## Tauri 前端适配器

`src/platform/tauri-api.ts` 删除统一的 `unsupported()` 帮助函数，并实现当前 `DesktopApi` 的所有方法：

- `loadSteamCollections` → Rust command
- `chooseExportDirectory` → Rust dialog command（原子选择并登记授权）
- `exportImages` → Rust command
- `loadSettings` / `saveSettings` → Rust commands
- `fetchApiAchievements` → Rust command
- `cacheAchievementIcons` → Rust command
- `openAchievementCacheDir` → Rust command
- `fetchOwnedGames` → Rust command
- `loadTierList` / `saveTierList` → Rust commands

现有扫描、收藏夹、本地选图和拼图保存实现保持不变。Vue 组件继续只访问 `window.imageLibrary`。

## 权限与安全

### Tauri plugins

新增 `tauri-plugin-opener`，仅从 Rust command 打开后端构造的成就缓存目录。

前端 capabilities 不新增：

- HTTP 通配权限
- shell 权限
- 任意 opener 路径权限
- 通配文件系统读写权限

如 Rust 侧 opener API 不依赖 WebView capability，则不向主窗口授予 opener 权限。

### 路径规则

所有用于授权判断的路径必须先 canonicalize：

- 扫描根目录
- 导出源文件
- 导出目标目录
- 用户选择的本地图片
- 成就缓存目录

目录包含关系使用路径组件判断，不使用字符串前缀。后端生成缓存路径时净化所有用户可控文件名。

### 网络规则

- Steam API endpoint 固定在代码中，并使用 HTTPS。
- 图标下载只接受 HTTPS URL。
- WebView 的 `img-src` 只额外允许现有界面使用的 Steam 图片域名：`cdn.cloudflare.steamstatic.com`、`cdn.akamai.steamstatic.com`、`steamcdn-a.akamaihd.net` 和 `media.steampowered.com`。
- WebView 的 `connect-src` 只额外允许生涯拼图直接读取的 `cdn.cloudflare.steamstatic.com`；Steam API 请求仍由 Rust 发起。
- 设置文件中的 API Key 不出现在日志和错误中。
- 设置和网络命令不向前端返回 API Key以外的额外敏感状态；`loadSettings` 仅为现有设置 UI 返回用户已保存的两个字段。

## 错误处理

Rust commands 使用 `Result<T, String>`。前端维持现有异常处理方式。

以下读取失败返回安全默认值：

- 设置文件缺失或损坏
- Tier List 文件缺失或损坏
- Owned Games 缓存缺失或损坏
- 成就缓存缺失或损坏
- Steam Collections 的单账号文件缺失或损坏
- 本地 Steam 时长文件缺失或损坏

以下情况返回 command 错误：

- 无法创建应用数据目录
- 无法保存设置或 Tier List
- 未授权路径参与导出
- 导出目标不是已选择目录
- 无法打开成就缓存目录

Steam API 的预期业务失败继续通过 `OwnedGamesResult.error` 或成就结果的可选 `error` 返回，以保持现有 UI 行为。

## 测试设计

新增 Rust 单元测试，但按照项目约束不自动执行。

### 设置与存储

- 缺失、损坏和错误字段返回默认设置
- 合法设置往返
- 写入内容不改变字段名

### Owned Games

- SteamID64 转 Account ID
- 非法 Steam ID
- `localconfig.vdf` 平衡块和时长解析
- Owned Games API JSON 映射
- API、家庭共享、Recently Played 与本地时长合并优先级
- DLC 过滤
- 损坏缓存拒绝
- 最近扫描路径优先于默认路径

### 成就

- 玩家成就与 Schema 合并
- 中文名称优先及 Schema 回退
- Schema 请求失败降级
- 缓存结构验证
- Windows 文件名净化
- 图标扩展名白名单
- 非 HTTPS 图标 URL拒绝

### Tier List

- 六个固定分组默认值
- 单个损坏条目被丢弃
- 非数组分组归零
- 未知分组忽略
- 合法 `appId` 保留

### Steam Collections

- 合法条目解析
- 隐藏收藏夹跳过
- 非数字 AppID 丢弃
- 损坏条目不影响后续条目
- 多账号结果合并

### 图片导出

- AppID 文件名推导
- 无 AppID 回退
- 同批重名编号
- 已存在目标跳过
- 单文件失败继续
- 未授权源文件拒绝
- 未授权目标目录拒绝
- canonical path 防止 `..`、junction 或符号链接绕过

## 实施顺序

1. 建立统一 storage 和共享运行状态。
2. 迁移 settings 与 Tier List 持久化。
3. 迁移 Steam Collections 解析。
4. 迁移图片导出与目录授权。
5. 迁移 Owned Games、本地时长解析和缓存。
6. 迁移成就 API、结果缓存、图标缓存和目录打开。
7. 接通 Tauri 前端适配器的全部剩余方法。
8. 静态审查导入、命令注册、权限和 Electron 隔离。

先完成文件持久化和纯本地能力，再实现共享 HTTP 基础设施与两个网络领域，可降低一次变更中的耦合。

## 完成标准

1. `src/platform/tauri-api.ts` 不再含未迁移占位分支。
2. `DesktopApi` 的全部方法在 Tauri 中有真实实现。
3. Tauri settings、Owned Games、成就、Tier List、收藏夹和导出数据流可独立于 Electron 工作。
4. Steam API 请求和凭据使用集中在 Rust 后端。
5. Owned Games 使用最近成功扫描路径，并在缺失时回退默认 Steam 路径。
6. 批量导出只读取已授权图片并写入用户明确选择的目录。
7. 成就缓存目录只能由后端构造并通过官方 opener plugin 打开。
8. Tauri preview 数据不读取或覆盖 Electron 数据。
9. Electron preload、IPC 名称和发布脚本保持不变。
10. 本阶段不接入正式 Tauri 发布流程，也不删除 Electron。

## 验证约束

按照用户既有要求，实施期间不自动运行：

- Rust 单元测试
- TypeScript 类型检查
- Rust 编译或 `cargo check`
- Vite 构建
- Electron 构建
- `npm run tauri:dev`
- `npm run tauri:build`

实现完成后必须明确报告哪些验证未执行。只有用户后续明确要求时，才运行相应命令。
