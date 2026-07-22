# Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完善 electron-builder 打包配置，添加应用图标，生成可分发的 Windows portable exe。

**Architecture:** 在现有 electron-builder 基础配置上添加图标，保持 portable 模式。数据目录逻辑无需改动。

**Tech Stack:** electron-builder 26.x, Vite, Vue 3, TypeScript

## Global Constraints

- 输出格式：Windows portable exe（非 NSIS 安装包）
- 数据目录：exe 同级目录（`PORTABLE_EXECUTABLE_DIR`）
- 不改动任何 electron 主进程逻辑代码

---

### Task 1: 生成应用图标

**Files:**
- Create: `build/icon.png`
- Create: `scripts/generate-icon.mjs`（临时脚本，生成完可删除）

**Interfaces:**
- Produces: `build/icon.png` — 256x256 PNG 图标，供 electron-builder 使用

- [ ] **Step 1: 创建 build 目录**

```bash
mkdir -p build
```

- [ ] **Step 2: 创建图标生成脚本**

创建 `scripts/generate-icon.mjs`，使用 Node.js 内置能力生成一个简单的 SVG 图标，然后用 `sharp`（如已安装）或直接保存为 SVG 让 electron-builder 处理。

由于项目没有 `sharp` 依赖且不值得为此添加，采用更简单的方案：创建一个 256x256 的 SVG 文件，electron-builder 支持 SVG 作为图标源。

创建 `build/icon.svg`：

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1b2838;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#2a475e;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="32" fill="url(#bg)"/>
  <text x="128" y="160" font-family="Arial,sans-serif" font-size="120" font-weight="bold" fill="#66c0f4" text-anchor="middle">S</text>
</svg>
```

- [ ] **Step 3: 验证 SVG 文件已创建**

```bash
ls -la build/icon.svg
```

Expected: 文件存在，大小约 400-600 bytes

- [ ] **Step 4: Commit**

```bash
git add build/icon.svg
git commit -m "feat: add app icon for electron-builder packaging"
```

---

### Task 2: 更新 electron-builder 配置

**Files:**
- Modify: `package.json:16-33` — build 配置中添加 `icon` 字段

**Interfaces:**
- Consumes: `build/icon.svg`（来自 Task 1）
- Produces: electron-builder 可识别的图标配置

- [ ] **Step 1: 更新 package.json build 配置**

在 `package.json` 的 `build` 字段中添加 `icon` 属性：

```json
{
  "build": {
    "appId": "com.steampc.imagebrowser",
    "productName": "SteamImageBrowser",
    "icon": "build/icon.svg",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**",
      "dist-electron/**",
      "package.json"
    ],
    "win": {
      "target": "portable"
    },
    "portable": {
      "artifactName": "SteamImageBrowser.exe"
    }
  }
}
```

完整 diff：在 `"productName": "SteamImageBrowser"` 后面添加一行 `"icon": "build/icon.svg",`。

- [ ] **Step 2: 验证 JSON 格式正确**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: configure electron-builder icon path"
```

---

### Task 3: 执行打包并验证

**Files:**
- None created/modified（验证任务）

- [ ] **Step 1: 执行完整打包**

```bash
npm run dist
```

Expected: 成功生成 `release/SteamImageBrowser.exe`

- [ ] **Step 2: 检查产物**

```bash
ls -la release/
```

Expected: `SteamImageBrowser.exe` 存在，大小合理（约 80-120MB）

- [ ] **Step 3: 运行 exe 验证**

手动运行 `release/SteamImageBrowser.exe`，确认：
1. 应用图标显示正确（任务栏、窗口标题栏）
2. 应用正常启动，显示图片浏览器界面
3. `collections.json` 在 exe 同级目录创建
4. `settings.json` 在 exe 同级目录创建
5. `achievements/` 目录在 exe 同级目录创建

- [ ] **Step 4: Commit（如有修复）**

如果验证过程中发现问题并修复，提交修复。
