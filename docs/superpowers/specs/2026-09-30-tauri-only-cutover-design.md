# Tauri-only 正式切换设计

## 背景

项目已将 `DesktopApi` 的全部桌面能力迁移到 Tauri Rust 后端，包括图片扫描、收藏夹、拼图保存、Steam Collections、图片导出、设置、Owned Games、游玩时长、成就和 Tier List。Vue 渲染层统一通过 `window.imageLibrary` 调用这些能力。

现有仓库仍保留 Electron 后端、依赖、TypeScript 编译配置和发布流程。这些双后端内容已经失去用途，并增加安装体积、维护成本和命令歧义。本阶段将项目正式切换为 Tauri-only。

## 目标

1. 删除 Electron 后端、测试、依赖和构建配置。
2. 将默认开发、构建和发布命令切换到 Tauri。
3. 仅生成 Windows NSIS `.exe` 安装包。
4. 保留现有 Vue 业务代码和 `DesktopApi` 前端门面。
5. 将已复制到 Tauri preview 的 Steam API 设置复制到正式 Tauri 数据目录。
6. 保留旧 Electron 数据文件和旧安装包作为人工备份，不主动删除。
7. 保持所有现有功能由 Tauri 实现。

## 非目标

本阶段不包含：

- 迁移旧 `collections.json`
- 迁移旧 `owned-games.json`
- 迁移旧 `achievements/`
- 迁移旧 `tierList.json`
- 删除磁盘上的旧 Electron 数据或安装包
- macOS 或 Linux 发布
- 代码签名和自动更新
- 将 Steam API Key 移入系统密钥链

## 最终架构

项目只保留一个桌面运行时：

```text
Vue components
      ↓
window.imageLibrary: DesktopApi
      ↓
Tauri adapter
      ↓
Rust commands and plugins
```

`DesktopApi` 和 `window.imageLibrary` 继续作为前端能力边界。它们不是 Electron 兼容层，因此无需删除或重写组件调用点。

删除 `src/platform/electron-api.ts`。`install-desktop-api.ts` 直接安装 Tauri 适配器，并在普通浏览器环境中抛出明确错误：

```text
当前应用必须在 Tauri 环境中运行
```

Tauri 适配器改为静态导入。项目不再包含 Electron preload、IPC 或主进程。

## 删除范围

删除：

- `electron/` 目录及全部 Electron 测试
- `src/platform/electron-api.ts`
- `tsconfig.node.json`
- `package.json` 的 `main` 字段
- `package.json` 的 electron-builder `build` 配置
- `build:electron` 和 `dev:electron` 脚本
- `electron` 和 `electron-builder` 依赖
- 仅服务于 Electron 启动的 `concurrently`、`cross-env` 和 `wait-on` 依赖
- `.gitignore` 中的 `dist-electron/`
- Vitest 配置中 `electron/**/*.test.ts`
- 发布脚本中的 Electron 镜像环境变量和旧 `release/` 产物目录假设

保留：

- `src/platform/desktop-api.ts`
- `src/platform/tauri-api.ts`
- `src/platform/install-desktop-api.ts`
- `window.imageLibrary`
- `@types/node`，因为 Vite 配置和发布脚本仍依赖 Node.js 类型
- 旧 Electron 用户数据和 `release/` 中已有安装包

## npm 命令

`package.json` 使用以下职责划分：

```json
{
  "scripts": {
    "dev": "tauri dev",
    "dev:web": "vite --host 127.0.0.1 --port 54088 --strictPort",
    "build:web": "vue-tsc --noEmit && vite build",
    "build": "tauri build --bundles nsis",
    "dist": "npm run build",
    "release": "node scripts/release.cjs",
    "upload": "node scripts/upload.cjs",
    "test": "vitest run",
    "test:rust": "cargo test --manifest-path src-tauri/Cargo.toml",
    "typecheck": "vue-tsc --noEmit"
  }
}
```

`dev:web` 与 `build:web` 是 Tauri 内部生命周期命令。`dev` 和 `build` 不得被 Tauri 的 `beforeDevCommand` 或 `beforeBuildCommand` 调用，以免递归。

## Tauri 正式配置

`src-tauri/tauri.conf.json` 调整为：

- `productName`: `SteamImageBrowser`
- `identifier`: `com.steampc.imagebrowser`
- `beforeDevCommand`: `npm run dev:web`
- `beforeBuildCommand`: `npm run build:web`
- `devUrl`: `http://127.0.0.1:54088`
- `frontendDist`: `../dist`
- `bundle.active`: `true`
- `bundle.targets`: `["nsis"]`
- 保留 `downloadBootstrapper` WebView2 安装模式
- 保留现有最小权限和 Steam 图片 CDN CSP

## 应用图标

使用现有 `build/icon.svg` 生成 Tauri 所需图标资源并存放在 `src-tauri/icons/`。至少提供配置和 Windows NSIS 构建所需的 PNG 与 ICO 文件。

图标生成使用 Tauri CLI 的标准 `icon` 命令。生成后由 `tauri.conf.json` 的 bundle icon 列表显式引用。不得依赖 Electron builder 的图标配置。

## 发布流程

### 产物位置

正式 NSIS 安装包位于：

```text
src-tauri/target/release/bundle/nsis/*.exe
```

发布脚本只扫描该目录，不扫描项目根目录的 `release/`，避免误上传旧 Electron 安装包。

### npm run release

1. 生成 `YYYYMMDD` 日期标签。
2. 执行 `npm run build`。
3. 在 Tauri NSIS 目录中查找 `.exe`。
4. 显示找到的安装包。
5. 询问是否上传。
6. 创建或复用 GitHub Release。
7. 删除同名旧资产并上传新安装包。

### npm run upload

不重新构建，只扫描 Tauri NSIS 目录并上传已有 `.exe`。

### 共享脚本

`scripts/_shared.cjs`：

- 将 `productName()` 改为读取 `src-tauri/tauri.conf.json`。
- 新增或改名为 `tauriNsisDirectory()`，返回固定 Tauri NSIS 目录。
- `listExes()` 继续只返回 `.exe`。
- 保留 GitHub Token、Release 查询/创建和上传逻辑。

`scripts/release.cjs` 删除 Electron 镜像环境变量和 `BUILD_DATE` 的 electron-builder artifactName 用法。

Tauri 默认产物名不强制包含日期；日期继续作为 GitHub Release tag。若需要稳定自定义安装包文件名，应在后续阶段通过 Tauri NSIS 配置单独设计，而不是在本次切换中引入重命名步骤。

## TypeScript 与测试配置

### TypeScript

删除 `tsconfig.node.json`。根 `tsconfig.json` 只包含：

```json
[
  "src/**/*.ts",
  "src/**/*.d.ts",
  "src/**/*.vue"
]
```

测试文件仍由 Vitest/Vite 类型环境覆盖。

### Vitest

`vite.config.ts` 的测试范围改为：

```ts
include: ['src/**/*.test.ts']
```

Electron 测试随 `electron/` 一起删除。Rust 端已有对应解析、缓存和路径授权测试，由 `npm run test:rust` 运行。

## 正式数据目录

identifier 从：

```text
com.steampc.imagebrowser-tauri-preview
```

改为：

```text
com.steampc.imagebrowser
```

因此正式应用使用新的 Tauri `app_data_dir()`。

执行切换时，把：

```text
%APPDATA%\com.steampc.imagebrowser-tauri-preview\settings.json
```

复制到：

```text
%APPDATA%\com.steampc.imagebrowser\settings.json
```

规则：

- 仅复制设置文件。
- 目标不存在时才复制。
- 不读取、显示或记录 API Key 与 Steam ID 内容。
- 目标已存在时保留目标并报告，不覆盖。
- 不复制其他 Electron 或 preview 数据。
- 不删除来源文件。

## 清理后的约束

全仓库应满足：

- `src/` 不导入 `electron` 或 Node.js 桌面 API。
- `package.json` 不含 Electron 依赖、入口或脚本。
- `vite.config.ts` 不引用 Electron 测试。
- `scripts/` 不引用 electron-builder、Electron 镜像或根 `release/` 目录。
- `src-tauri/` 是唯一桌面后端和安装包来源。
- 普通浏览器运行不会获得降级后端，而是明确失败。

## 验收标准

1. `npm run dev` 启动 Tauri，而不是仅启动 Vite。
2. `beforeDevCommand` 调用 `npm run dev:web`，不存在递归。
3. `npm run build` 只构建 Tauri NSIS 安装包。
4. `npm run dist` 等同于正式 Tauri 构建。
5. `npm run release` 和 `npm run upload` 只处理 Tauri NSIS `.exe`。
6. 全部 `DesktopApi` 功能由 Tauri 实现。
7. 仓库中不存在 Electron 源码、依赖、IPC、preload 或构建配置。
8. 正式 Tauri 数据目录包含有效设置文件。
9. 旧 Electron 数据和旧安装包仍留在原位置。
10. Windows Tauri 开发和 NSIS 构建能够通过。

## 验证约束

按照用户既有偏好，实施阶段不自动运行测试、类型检查或构建。实现结束时必须明确报告未执行的验证。用户明确要求运行时，再依次执行：

```text
npm test
npm run test:rust
npm run typecheck
npm run build
```
