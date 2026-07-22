# 打包逻辑设计

## 目标

完善 SteamImageBrowser 的 electron-builder 打包配置，生成可分发的 Windows portable exe。

## 现状

- 已有基础 electron-builder 配置（portable 目标，输出到 `release/`）
- `npm run dist` 脚本已存在（`vue-tsc --noEmit && vite build && tsc -p tsconfig.node.json && electron-builder`）
- 数据目录逻辑已正确处理：`collections.json`、`settings.json`、`achievements/` 均存放在 exe 同级目录（`PORTABLE_EXECUTABLE_DIR`）
- 无自定义应用图标

## 打包后文件结构

```
SteamImageBrowser.exe
├── resources/
│   └── app.asar                ← dist/ + dist-electron/ + package.json
├── collections.json            ← 运行时创建，用户收藏夹数据
├── settings.json               ← 运行时创建，Steam API 配置
└── achievements/               ← 运行时创建，成就图标缓存
    └── <appId>_<gameName>/
        ├── <achievementId>.jpg
        └── <achievementId>_gray.jpg
```

## 改动范围

### 1. 新建 `build/icon.ico`

创建应用图标文件。使用一个简单的 Steam 主题图标（256x256 .ico 格式），放在 `build/` 目录下供 electron-builder 使用。

### 2. 更新 `package.json` build 配置

在 `build` 字段中添加 `icon` 属性：

```json
{
  "build": {
    "icon": "build/icon.ico",
    // ... 其余不变
  }
}
```

### 不需要改动的部分

- `electron/main.ts` — 数据目录逻辑已正确
- `electron/achievementCache.ts` — 缓存逻辑已正确
- `electron/collectionsStore.ts` — 存储逻辑已正确
- `electron/settingsStore.ts` — 存储逻辑已正确
- `vite.config.ts` — 构建配置已正确
- `tsconfig.node.json` — TS 编译配置已正确

## 验证方式

1. 执行 `npm run dist`，确认 `release/` 目录生成 `SteamImageBrowser.exe`
2. 运行生成的 exe，确认：
   - 应用图标显示正确
   - `collections.json` 在 exe 同级目录创建
   - `settings.json` 在 exe 同级目录创建
   - `achievements/` 在 exe 同级目录创建
   - 图片浏览、收藏夹、成就缓存功能正常
