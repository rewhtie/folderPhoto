# SteamImageBrowser

## 项目简介

SteamImageBrowser 是一款用于浏览和整理 Steam 本地游戏图片的桌面工具。它可以扫描 Steam 图片目录，按游戏查看封面、背景和徽标，并提供收藏、拼图、排行和游戏测评功能。

## 功能特点

- 扫描并分类展示 Steam 本地游戏图片
- 按游戏名称、图片类型和收藏夹筛选内容
- 收藏常用图片并批量导出
- 自由选择图片并生成拼图
- 按游玩时长生成游戏生涯拼图
- 制作游戏排行与游戏测评表
- 记录游戏类型、游玩体验、时长、评分和推荐度
- 导入、导出游戏测评记录
- 查看游戏成就与游玩时长
- 支持明暗主题切换

## 使用说明

1. 启动应用后，点击“选择文件夹”，选择 Steam 图片目录。默认目录通常为：

   ```text
   C:\Program Files (x86)\Steam\appcache\librarycache
   ```

2. 扫描完成后，可浏览图片、添加收藏、导出图片，或使用拼图、游戏排行和游戏测评功能。

3. 如需获取游戏成就与游玩时长，请打开“设置”，填写并保存：

   - **Steam Web API Key**：可前往 [Steam Web API Key](https://steamcommunity.com/dev/apikey) 申请。
   - **Steam ID**：填写个人账号的 64 位 Steam ID。

   未配置 Steam Web API Key 和 Steam ID 时，本地图片浏览、收藏和测评等功能仍可正常使用，但无法获取完整的成就与游玩时长数据。

## 开发

```bash
npm install
npm run dev
```

`npm run dev` 会启动 Vite 和 Tauri 桌面窗口。

## 构建 Windows 安装包

```bash
npm run build
```

NSIS 安装包生成在 `src-tauri/target/release/bundle/nsis/`。
