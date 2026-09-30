# Tauri Windows 双后端验证阶段设计

## 背景

当前 Electron NSIS 安装包约 100MB，主要体积来自随应用分发的 Chromium、V8 和 Node.js。Tauri 使用 Windows 系统 WebView2，可显著缩小安装包，但无法直接运行现有 Electron 主进程代码。

本阶段验证 Tauri 是否能完整承载项目最关键的本地图片链路，同时保留 Electron 稳定版本。验证通过后，再逐步迁移其余桌面能力。

## 目标

1. 保留现有 Vue、Vite、UnoCSS 和纯 TypeScript 业务模块。
2. 保留 Electron 开发、打包和发布流程。
3. 新增 Windows-only Tauri 开发入口。
4. 在 Tauri 中完整复刻 Steam 图片扫描，包括游戏名称与 DLC 过滤。
5. 在 Tauri 中实现目录选择、本地图片显示、收藏夹持久化、本地图片选择和拼图保存。
6. 通过统一的 `DesktopApi` 适配 Electron 与 Tauri，避免逐个重写 Vue 组件。
7. 限制本地图片协议权限，不暴露整个磁盘。

## 非目标

本阶段不包含：

- 正式 Tauri 安装包、签名或发布脚本
- 删除或修改 Electron 发布流程
- 成就读取、成就缓存或 Steam Web API
- Owned Games 与生涯拼图后端
- Tier List 磁盘存储
- Steam collections 读取
- Electron 数据自动迁移
- macOS 或 Linux 支持
- 固定版本 WebView2 运行时

## 总体架构

Electron 与 Tauri 共用同一套 Vue 前端和 `src/shared` 业务模块，但保留各自的平台实现。

```text
src/
├─ platform/
│  ├─ desktop-api.ts
│  ├─ electron-api.ts
│  ├─ tauri-api.ts
│  └─ install-desktop-api.ts
├─ components/
├─ shared/
└─ main.ts

electron/
├─ main.ts
├─ preload.cts
└─ ...现有 Electron 后端

src-tauri/
├─ Cargo.toml
├─ tauri.conf.json
├─ capabilities/
│  └─ default.json
└─ src/
   ├─ main.rs
   ├─ lib.rs
   ├─ commands/
   │  ├─ image_library.rs
   │  └─ collections.rs
   ├─ protocol/
   │  └─ local_image.rs
   └─ steam/
      ├─ app_info.rs
      └─ manifest.rs
```

依赖方向：

```text
Vue components
      ↓
DesktopApi
  ↙       ↘
Electron   Tauri adapter
preload     invoke/plugins
              ↓
          Rust commands
```

## DesktopApi 边界

将当前 `window.imageLibrary` 的接口类型从 `src/env.d.ts` 提取到 `src/platform/desktop-api.ts`。

```ts
export interface DesktopApi {
  scanImages(directoryPath: string, options?: ScanImagesOptions): Promise<ScanImagesResult>
  loadSteamCollections(librarycacheDir: string): Promise<SteamCollection[]>
  selectDirectory(): Promise<string | null>
  loadCollections(): Promise<Collections>
  saveCollections(collections: Collections): Promise<void>
  chooseExportDirectory(): Promise<string | null>
  exportImages(targetDirectory: string, absolutePaths: string[]): Promise<ExportResult>
  saveCollage(buffer: ArrayBuffer, suggestedName: string): Promise<string | null>
  pickLocalImages(): Promise<string[] | null>
  loadSettings(): Promise<SteamSettings>
  saveSettings(settings: SteamSettings): Promise<void>
  fetchApiAchievements(appId: string): Promise<AchievementResult & { error?: string }>
  cacheAchievementIcons(appId: string, gameName: string, icons: AchievementIcon[]): Promise<CacheIconsResult>
  openAchievementCacheDir(appId: string, gameName: string): Promise<void>
  fetchOwnedGames(force?: boolean): Promise<OwnedGamesResult>
  loadTierList(): Promise<TierList>
  saveTierList(list: TierList): Promise<void>
}
```

`src/env.d.ts` 只声明：

```ts
interface Window {
  imageLibrary: DesktopApi
}
```

### Electron 适配

Electron 继续通过 `preload.cts` 注入 `window.imageLibrary`。不改变 IPC 名称、参数或返回结构。

`electron-api.ts` 只返回已由 preload 注入的对象，不再复制 Electron IPC 实现。

### Tauri 适配

`tauri-api.ts` 使用：

- `@tauri-apps/api/core` 的 `invoke`
- `@tauri-apps/plugin-dialog`
- `@tauri-apps/plugin-fs`

首阶段真实实现：

- `scanImages`
- `selectDirectory`
- `loadCollections`
- `saveCollections`
- `pickLocalImages`
- `saveCollage`

其他方法保留完整签名，但统一抛出：

```text
当前 Tauri 验证版暂未迁移此功能
```

不得静默返回空数组、空对象或成功结果。

### 启动安装

`src/main.ts` 在 Vue 挂载前调用 `installDesktopApi()`：

- 检测到 Tauri 环境时安装 Tauri 适配器。
- Electron 环境继续使用 preload 已注入的对象。
- 两者都不存在时安装浏览器兼容适配器，或抛出明确的平台初始化错误。

组件继续使用 `window.imageLibrary`，本阶段不逐个改写调用点。

## Rust 命令

### select_directory

由 Tauri dialog plugin 在前端完成目录选择，不需要自定义 Rust command。返回 Windows 绝对路径或 `null`。

### scan_images

Rust command：

```rust
#[tauri::command]
async fn scan_images(
    state: State<'_, AppState>,
    directory_path: String,
    options: ScanImagesOptions,
) -> Result<ScanImagesResult, String>
```

行为必须与 Electron 版本一致：

1. 去除首尾空白。
2. 空路径返回“请输入目录路径”。
3. 不存在返回“目录不存在”。
4. 非目录返回“路径不是文件夹”。
5. 无读取权限返回“无法读取目录，请检查权限”。
6. 递归扫描配置中的目标图片文件名。
7. 扩展名匹配不区分大小写。
8. 从相对路径中第一个纯数字目录提取 AppID。
9. 解析 `appinfo.vdf` 获取名称与类型。
10. 简体中文本地化名称优先于默认名称。
11. 无 appinfo 名称时从 `appmanifest_<appid>.acf` 回退读取。
12. `includeDlc === false` 时排除 `common.type === DLC`。
13. 按相对路径排序。
14. 返回与 `ImageAsset` 完全兼容的字段。
15. 扫描成功后，将 canonicalized 根目录加入受控图片协议允许范围。

文件名配置需要形成 Rust 侧等价常量。首阶段允许 TypeScript 与 Rust 各维护一份，但设计文档必须标明同步要求；后续可改成构建时生成。

### load_collections / save_collections

Rust command 使用 Tauri preview 独立数据目录中的 `collections.json`。

- 文件不存在、JSON 损坏或结构无效时返回 `{}`。
- 保存时使用 UTF-8 格式化 JSON。
- 不读取或覆盖 Electron 正式版文件。
- 数据结构与现有 `Collections` 相同。

## Steam appinfo.vdf 解析

Rust 解析器完整复刻当前 Electron v29 行为。

### 输入格式

- Magic：`0x07564429`
- 字符串表偏移：文件头偏移 8 处的小端 `u64`
- App 元数据长度：60 字节
- KV 类型：
  - `0x00`：嵌套对象
  - `0x01`：NUL 结尾字符串
  - `0x02`：4 字节值
  - `0x07`：8 字节值
  - `0x08`：对象结束

### 输出字段

只提取：

- `common.name`
- `common.type`
- `common.name_localized.schinese`

名称优先级：

```text
schinese > common.name > manifest name > 空字符串
```

### 容错

- Magic 不匹配返回空映射。
- 字符串表偏移越界返回空映射。
- 单个 App 块损坏只跳过该 App，不中止全部解析。
- 所有偏移加法和读取前必须检查边界，禁止 panic。

### 兼容基准

将当前 Electron `appInfoParser.test.ts` 的最小 v29 缓冲区转换成 Rust 单元测试。测试覆盖：

- 普通英文名称
- 简体中文名称优先
- DLC 类型
- 错误 Magic
- 越界偏移
- 单个损坏 App 不影响后续记录

## Manifest 回退

Rust 从：

```text
<Steam root>\steamapps\appmanifest_<appid>.acf
```

读取名称。`Steam root` 由所选 `appcache\librarycache` 向上两级推导。

名称解析规则保持现状：

```regex
"name"\s+"([^"]*)"
```

单个 manifest 读取失败时忽略，不影响扫描。

## 受控本地图片协议

注册自定义协议：

```text
steam-image://file/<percent-encoded-absolute-path>
```

### 授权状态

Rust `AppState` 保存：

- 已授权目录的 canonical path 集合
- 用户通过图片选择器明确选择的 canonical file 集合

授权来源：

- 成功扫描的目录
- `pickLocalImages()` 明确选中的文件
- 后续阶段加入应用自有缓存目录

### 路径验证

协议处理器必须：

1. percent-decode 请求路径。
2. 转成 Windows `PathBuf`。
3. canonicalize 目标路径。
4. 确认目标是普通文件。
5. 确认目标位于某个授权目录内，或精确匹配授权文件。
6. 未授权返回 403。
7. 不存在返回 404。
8. 读取失败返回 500。

canonicalize 后再判断，防止 `..`、junction 和符号链接绕过。

### 响应

根据扩展名返回 MIME：

- JPEG：`image/jpeg`
- PNG：`image/png`
- WebP：`image/webp`
- GIF：`image/gif`
- BMP：`image/bmp`

同时返回：

```text
Access-Control-Allow-Origin: *
Cache-Control: no-cache
```

CORS 头用于保持 Canvas 和 `html-to-image` 导出能力。

Tauri 适配器负责生成协议 URL；Vue 组件只消费 `ImageAsset.fileUrl`。

## 本地图片选择

`pickLocalImages()` 使用 dialog plugin：

- 支持多选。
- 仅允许 jpg、jpeg、png、webp、gif、bmp。
- 取消时返回 `null`，适配器继续按当前公共帮助函数转换成空数组。
- 选中后调用 Rust 授权命令，将每个 canonical file 加入协议允许集合。
- 返回 `steam-image://` URL 数组。

## 拼图保存

`saveCollage(buffer, suggestedName)` 在 Tauri 前端适配器内完成：

1. dialog plugin 显示保存对话框。
2. 根据建议文件名提供 PNG 或 JPEG filter。
3. 取消返回 `null`。
4. 将 `ArrayBuffer` 转为 `Uint8Array`。
5. 使用 fs plugin 写入用户选择路径。
6. 返回保存路径。

不得将大图片转换为普通 JSON 数字数组传给 Rust command。

## 数据隔离与兼容

### Tauri preview 数据目录

首阶段使用独立应用标识：

```text
com.steampc.imagebrowser-tauri-preview
```

收藏夹写入 Tauri preview 的应用数据目录。不得读取或覆盖 Electron 正式版数据。

### localStorage

Electron 和 Tauri WebView 使用不同的 localStorage 空间。因此 Tauri preview 不保证看到 Electron 的游戏测评记录、主题或其他浏览器存储。

首阶段不迁移这些数据。正式切换阶段必须设计一次性导入机制。

### 后续正式迁移

正式迁移时需要覆盖：

- Electron userData 下的 JSON 文件
- 便携版可执行文件旁的数据
- WebView localStorage 中的测评数据
- 数据迁移失败后的回滚与重复执行

这些不属于本阶段。

## Tauri 配置与安全

### Plugins

首阶段使用：

- `tauri-plugin-dialog`
- `tauri-plugin-fs`

如保存与目录打开均由前端插件完成，不启用额外 shell 权限。

### Capabilities

只授予主窗口：

- 调用已注册 commands
- 打开目录和文件对话框
- 保存用户明确选择的文件
- 写入应用数据目录

不授予任意 shell 执行、全盘文件读写或通配 asset scope。

### WebView2

开发阶段使用系统 WebView2。后续打包优先使用：

```json
{
  "webviewInstallMode": {
    "type": "downloadBootstrapper"
  }
}
```

禁止 `fixedRuntime`，因为它会让安装包额外增加约 180MB。

## 开发与构建脚本

现有脚本保持不变：

- `dev`
- `dev:electron`
- `build:electron`
- `dist`
- `release`
- `upload`

新增：

```json
{
  "tauri:dev": "tauri dev",
  "tauri:build": "tauri build"
}
```

首阶段只验收 `npm run tauri:dev`。`tauri:build` 仅作为后续入口预留，不接入 `release.cjs`。

## 错误处理

Rust command 使用 `Result<T, String>` 返回可显示错误。前端适配器将字符串错误包装为 `Error`，保持现有组件错误处理逻辑。

尚未迁移的方法统一抛出：

```text
当前 Tauri 验证版暂未迁移此功能
```

不得静默吞掉错误或返回伪造成功数据。

## 首阶段验收标准

1. `npm run tauri:dev` 能启动现有 Vue 页面。
2. 启动时能加载 Tauri preview 收藏夹，不依赖 Electron preload。
3. “选择文件夹”打开 Windows 原生目录选择器。
4. 扫描结果与 Electron 一致：目标文件名、递归、AppID、游戏名、简体中文优先、manifest 回退、DLC 开关和排序均一致。
5. 本地图片正常显示。
6. 未授权本地路径被协议拒绝。
7. 图片可用于 Canvas 和 `html-to-image`。
8. 自由拼图可选择本地图片。
9. PNG/JPEG 可通过保存对话框写入磁盘。
10. 收藏夹可在 Tauri preview 数据目录中保存并恢复。
11. 尚未迁移的方法抛出明确错误。
12. Electron `dev:electron`、`dist`、`release` 和 preload 保持不变。

## 验证约束

按用户既有要求，实现阶段不自动运行测试、类型检查或构建。实现完成时必须明确报告：

- Rust、TypeScript 和配置文件已写入，但未编译验证。
- `npm run tauri:dev` 尚未执行。
- Rust 单元测试尚未执行。
- Tauri 所需系统依赖是否已安装尚未确认。

用户后续明确要求验证时，再运行相应命令。

## 后续迁移顺序

验证阶段通过后，建议按以下顺序继续：

1. Settings 与 Steam API 凭据
2. Owned Games 与生涯拼图
3. 成就读取、API、图标缓存和打开目录
4. Tier List 存储
5. Steam collections
6. 图片批量导出
7. Electron 数据迁移
8. Tauri Windows 安装包与发布脚本
9. 删除 Electron

## 完成标准

- Electron 与 Tauri 可共享同一 Vue 前端。
- Tauri 开发入口具备完整 Steam 图片扫描链路。
- 本地图片协议经过 canonical path 授权检查。
- 收藏夹和拼图保存可在 Tauri preview 中工作。
- Electron 现有代码和发布流程未被替换。
- 未迁移功能以明确错误暴露。
