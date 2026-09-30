# Tauri-only Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tauri the project's only desktop runtime and Windows NSIS release target, then remove all Electron code, dependencies, and configuration.

**Architecture:** Vue keeps the existing `DesktopApi` facade but installs only the Tauri adapter. Tauri owns development startup, production frontend builds, Windows NSIS bundling, and all native functionality; release scripts discover artifacts only under Tauri's NSIS bundle directory.

**Tech Stack:** Vue 3, TypeScript, Vite, Vitest, Tauri 2, Rust 2021, Node.js release scripts, GitHub Releases API

**Spec:** `docs/superpowers/specs/2026-09-30-tauri-only-cutover-design.md`

## Global Constraints

- Delete the Electron runtime, IPC implementation, tests, dependencies, and build configuration.
- Keep `src/platform/desktop-api.ts`, `src/platform/tauri-api.ts`, and `window.imageLibrary` as the frontend/native boundary.
- Use identifier `com.steampc.imagebrowser` and product name `SteamImageBrowser`.
- Build only a Windows NSIS `.exe`; do not add MSI, macOS, Linux, signing, or updater work.
- Preserve the existing GitHub Release interaction and token handling.
- Release and upload scripts must inspect only `src-tauri/target/release/bundle/nsis`.
- Copy only the preview `settings.json` into the formal Tauri data directory; do not overwrite an existing target.
- Do not migrate or delete legacy collections, Owned Games, achievements, Tier List, or old `release/` artifacts.
- Preserve unrelated working-tree changes.
- Do not run tests, type checks, builds, `tauri dev`, or runtime verification unless the user explicitly requests it after implementation.
- Do not create Git commits.

## Review Focus

- `npm run dev` must not recurse through Tauri's `beforeDevCommand`; Task 1 statically asserts the public/internal script split.
- `npm run build` must not recurse through `beforeBuildCommand`; Task 2 statically asserts the public/internal build split.
- Release discovery must not upload stale Electron `.exe` files from `release/`; Task 3 tests the fixed Tauri NSIS path.
- Removing Electron must not remove the frontend `DesktopApi` facade or leave imports of deleted modules; Task 4 audits imports and all interface methods.
- Formal settings migration must never overwrite an existing target or expose credential values; Task 5 checks only file presence and configuration booleans.

---

### Task 1: Switch application startup and npm metadata to Tauri-only

**Files:**
- Modify: `src/platform/install-desktop-api.ts`
- Delete: `src/platform/electron-api.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Delete: `tsconfig.node.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `createTauriDesktopApi(): DesktopApi` and Tauri `isTauri()`.
- Produces: Tauri-only `installDesktopApi(): Promise<void>` and canonical npm commands `dev`, `dev:web`, `build:web`, `build`, `dist`, `test:rust`, and `typecheck`.

- [ ] **Step 1: Simplify desktop API installation**

Replace `src/platform/install-desktop-api.ts` with:

```ts
import { isTauri } from '@tauri-apps/api/core'
import { createTauriDesktopApi } from './tauri-api'

export async function installDesktopApi(): Promise<void> {
  if (!isTauri()) {
    throw new Error('当前应用必须在 Tauri 环境中运行')
  }
  window.imageLibrary = createTauriDesktopApi()
}
```

This removes dynamic backend selection but preserves the existing asynchronous bootstrap contract in `src/main.ts`.

- [ ] **Step 2: Replace npm scripts and remove Electron package metadata**

Update `package.json` to remove the top-level `main` key and the complete electron-builder `build` object. Replace the scripts object with:

```json
{
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
```

Remove these development dependencies:

```text
concurrently
cross-env
electron
electron-builder
wait-on
```

Use `npm uninstall -D concurrently cross-env electron electron-builder wait-on` so `package-lock.json` is updated consistently. Do not run install, tests, type checking, or builds afterward.

- [ ] **Step 3: Remove Electron references from TypeScript and Vitest configuration**

In `vite.config.ts`, replace:

```ts
include: ['src/**/*.test.ts', 'electron/**/*.test.ts'],
```

with:

```ts
include: ['src/**/*.test.ts'],
```

In `tsconfig.json`, replace the include list with:

```json
["src/**/*.ts", "src/**/*.d.ts", "src/**/*.vue"]
```

Delete `tsconfig.node.json`. Remove `dist-electron/` from `.gitignore`, but keep legacy data and release ignores.

- [ ] **Step 4: Delete the obsolete adapter**

Delete `src/platform/electron-api.ts`. Search `src/` for `electron-api`; no imports may remain.

- [ ] **Step 5: Perform a static package and startup audit**

Read the resulting files and confirm:

- `npm run dev` invokes `tauri dev`.
- `beforeDevCommand` will call `npm run dev:web`, not `npm run dev`.
- `npm run build` invokes Tauri NSIS bundling.
- no `main`, electron-builder `build`, `dev:electron`, or `build:electron` key remains;
- no Electron-only dependency remains in the root package manifest or root lockfile;
- `installDesktopApi` cannot install an Electron backend.

Do not run any script.

---

### Task 2: Promote Tauri preview configuration to the formal NSIS application

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Create: `src-tauri/icons/32x32.png`
- Create: `src-tauri/icons/128x128.png`
- Create: `src-tauri/icons/128x128@2x.png`
- Create: `src-tauri/icons/icon.ico`
- Optional generated platform icons under: `src-tauri/icons/`

**Interfaces:**
- Consumes: `dev:web`, `build:web`, and `build/icon.svg`.
- Produces: formal `com.steampc.imagebrowser` application metadata and NSIS output under `src-tauri/target/release/bundle/nsis`.

- [ ] **Step 1: Update Tauri lifecycle commands and identity**

Set these exact values in `src-tauri/tauri.conf.json`:

```json
{
  "productName": "SteamImageBrowser",
  "identifier": "com.steampc.imagebrowser",
  "build": {
    "beforeDevCommand": "npm run dev:web",
    "beforeBuildCommand": "npm run build:web",
    "devUrl": "http://127.0.0.1:54088",
    "frontendDist": "../dist"
  }
}
```

Preserve window size, minimum size, CSP, and WebView2 `downloadBootstrapper`.

- [ ] **Step 2: Enable only NSIS bundling**

Set:

```json
"bundle": {
  "active": true,
  "targets": ["nsis"],
  "icon": [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.ico"
  ],
  "windows": {
    "webviewInstallMode": {
      "type": "downloadBootstrapper"
    }
  }
}
```

Do not enable MSI, updater, signing, fixed WebView2 runtime, or additional capabilities.

- [ ] **Step 3: Generate Tauri icons from the existing source artwork**

Run only the asset-generation command:

```bash
npx tauri icon build/icon.svg --output src-tauri/icons
```

This writes local image assets but does not compile or run the application. Confirm the four configured icon paths exist. Keep any additional standard Tauri-generated icons unless they are clearly unrelated.

- [ ] **Step 4: Statically validate the configuration**

Parse `tauri.conf.json` as JSON and assert:

```text
identifier = com.steampc.imagebrowser
beforeDevCommand = npm run dev:web
beforeBuildCommand = npm run build:web
bundle.active = true
bundle.targets = [nsis]
```

Confirm CSP still contains the controlled `steam-image` protocol and the exact Steam image CDN allowlist. Do not run `tauri dev` or `tauri build`.

---

### Task 3: Migrate GitHub Release scripts to Tauri NSIS artifacts

**Files:**
- Modify: `scripts/_shared.cjs`
- Modify: `scripts/release.cjs`
- Modify: `scripts/upload.cjs`
- Create: `scripts/tauri-release-paths.test.cjs`

**Interfaces:**
- Consumes: `src-tauri/tauri.conf.json` and `src-tauri/target/release/bundle/nsis/*.exe`.
- Produces: `tauriNsisDirectory()`, Tauri-aware `productName()`, and release/upload commands that cannot select legacy Electron artifacts.

- [ ] **Step 1: Write a non-network release-path test without running it**

Create `scripts/tauri-release-paths.test.cjs`:

```js
const assert = require('node:assert/strict');
const { join } = require('node:path');
const {
  ROOT,
  productName,
  tauriNsisDirectory,
  listExes,
} = require('./_shared.cjs');

assert.equal(productName(), 'SteamImageBrowser');
assert.equal(
  tauriNsisDirectory(),
  join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'nsis'),
);
assert.ok(!tauriNsisDirectory().includes(`${join(ROOT, 'release')}`));
assert.deepEqual(listExes(join(ROOT, '__missing-tauri-output__')), []);
console.log('tauri release path assertions passed');
```

The test must not access GitHub, read credentials, build the app, or mutate release assets. Do not run it.

- [ ] **Step 2: Make shared release helpers Tauri-aware**

In `scripts/_shared.cjs`:

- `productName()` reads and parses `src-tauri/tauri.conf.json`, returning its `productName`; retain `SteamImageBrowser` as the fallback.
- Add:

```js
function tauriNsisDirectory() {
  return join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
}
```

- Make `listExes(distDir)` return `[]` when the directory does not exist, then return only regular `.exe` files.
- Export `tauriNsisDirectory`.
- Keep authentication and GitHub API behavior unchanged.

- [ ] **Step 3: Update build-and-release behavior**

In `scripts/release.cjs`:

- import `tauriNsisDirectory`;
- remove `BUILD_DATE`, `ELECTRON_MIRROR`, and `ELECTRON_BUILDER_BINARIES_MIRROR` assignments;
- keep `await run('npm', ['run', 'build'], { cwd: ROOT })`;
- set `distDir` to `tauriNsisDirectory()`;
- change the missing artifact error to `未在 Tauri NSIS 产物目录找到 .exe 安装包，请检查打包是否成功。`;
- preserve date tag, release notes, confirmation, token, GitHub Release, and upload behavior.

- [ ] **Step 4: Update upload-only behavior**

In `scripts/upload.cjs`:

- import `tauriNsisDirectory`;
- remove unused `join` and `basename` imports;
- set `distDir` to `tauriNsisDirectory()`;
- change the missing artifact error to `Tauri NSIS 产物目录中没有 .exe 安装包。请先运行 npm run build。`;
- preserve all GitHub upload behavior.

- [ ] **Step 5: Perform static path and secret audit**

Search `scripts/` and confirm:

- no `electron`, `electron-builder`, `ELECTRON_MIRROR`, or `release/` output lookup remains;
- both entry scripts call `tauriNsisDirectory()`;
- `_shared.cjs` still reads GitHub tokens only from environment variables or `.release-token`;
- no test or diagnostic prints the token.

Do not run the test or contact GitHub.

---

### Task 4: Remove the Electron source tree and audit the Tauri-only contract

**Files:**
- Delete: `electron/appInfoParser.test.ts`
- Delete: `electron/appInfoParser.ts`
- Delete: `electron/appInfoStore.ts`
- Delete: `electron/appManifest.test.ts`
- Delete: `electron/appManifest.ts`
- Delete: `electron/achievementCache.ts`
- Delete: `electron/achievementStore.test.ts`
- Delete: `electron/achievementStore.ts`
- Delete: `electron/collectionsStore.ts`
- Delete: `electron/imageExporter.ts`
- Delete: `electron/imageProtocol.test.ts`
- Delete: `electron/imageProtocol.ts`
- Delete: `electron/imageScanner.test.ts`
- Delete: `electron/imageScanner.ts`
- Delete: `electron/libraryHeroScanner.test.ts`
- Delete: `electron/main.ts`
- Delete: `electron/ownedGamesStore.test.ts`
- Delete: `electron/ownedGamesStore.ts`
- Delete: `electron/preload.cts`
- Delete: `electron/settingsStore.ts`
- Delete: `electron/steamCollections.test.ts`
- Delete: `electron/steamCollections.ts`
- Delete: `electron/tierListStore.ts`
- Inspect: `src/platform/desktop-api.ts`
- Inspect: `src/platform/tauri-api.ts`
- Inspect: `src/platform/install-desktop-api.ts`

**Interfaces:**
- Consumes: completed Tauri implementation of every `DesktopApi` method.
- Produces: repository with no Electron source/runtime path.

- [ ] **Step 1: Confirm the deletion inventory before deleting**

List the direct children of `electron/` and compare them with the explicit list above. If an additional file exists, inspect it and classify it before deletion. Do not use a recursive wildcard deletion.

- [ ] **Step 2: Delete each listed Electron file explicitly**

Delete the files listed in the task's **Files** section, then remove the empty `electron/` directory. Do not delete root data files, `release/`, or any path outside `electron/`.

- [ ] **Step 3: Audit frontend API coverage**

Compare `DesktopApi` methods with `createTauriDesktopApi()`. Confirm all 17 methods are implemented:

```text
scanImages
loadSteamCollections
selectDirectory
loadCollections
saveCollections
chooseExportDirectory
exportImages
saveCollage
pickLocalImages
loadSettings
saveSettings
fetchApiAchievements
cacheAchievementIcons
openAchievementCacheDir
fetchOwnedGames
loadTierList
saveTierList
```

Search `src/` for imports from `electron`, `node:`, `electron-api`, and `ipcRenderer`; all must return zero production matches. Existing prose or test fixture strings that merely say “Electron” are not runtime dependencies and should be renamed only when they describe the removed backend.

- [ ] **Step 4: Audit repository configuration**

Search tracked and untracked source/config files, excluding `.git/`, `node_modules/`, `src-tauri/target/`, `.superpowers/`, and historical design/plan documents. Confirm no active configuration references:

```text
electron-builder
dist-electron
dev:electron
build:electron
electron/main
preload.cts
```

Historical design documents may retain Electron references as project history.

- [ ] **Step 5: Update README for Tauri-only commands**

Add concise development and build sections:

```markdown
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
```

Do not describe Electron as a supported runtime.

---

### Task 5: Copy preview settings into the formal Tauri data directory

**Files outside repository:**
- Read/copy only: `%APPDATA%/com.steampc.imagebrowser-tauri-preview/settings.json`
- Create only if absent: `%APPDATA%/com.steampc.imagebrowser/settings.json`

**Interfaces:**
- Consumes: preview settings file already copied from the prior Electron development setup.
- Produces: formal Tauri application settings without exposing or overwriting credentials.

- [ ] **Step 1: Check source and target metadata without printing file contents**

Use PowerShell `Test-Path` for both paths. Report only:

```text
SourceExists
TargetExists
```

Do not print file contents, file hashes, API Key, or Steam ID.

- [ ] **Step 2: Copy only when the target does not exist**

If source exists and target does not:

```powershell
New-Item -ItemType Directory -Path "$env:APPDATA\com.steampc.imagebrowser" -Force
Copy-Item -LiteralPath "$env:APPDATA\com.steampc.imagebrowser-tauri-preview\settings.json" `
  -Destination "$env:APPDATA\com.steampc.imagebrowser\settings.json"
```

If the target exists, skip copying. Never use `-Force` on `Copy-Item`.

- [ ] **Step 3: Validate presence and shape without exposing values**

Parse only the copied target and report booleans:

```text
Exists
ValidJson
ApiKeyConfigured
SteamIdConfigured
```

Do not print either field value. Do not copy or delete any other data file or directory.

---

### Task 6: Final static review and handoff

**Files:**
- Inspect: `package.json`
- Inspect: `package-lock.json`
- Inspect: `src/platform/*.ts`
- Inspect: `src-tauri/**/*`
- Inspect: `scripts/*.cjs`
- Inspect: `vite.config.ts`
- Inspect: `tsconfig.json`
- Inspect: `.gitignore`
- Inspect: `README.md`

**Interfaces:**
- Consumes: all prior cutover tasks.
- Produces: a Tauri-only source tree and an explicit unverified-work report.

- [ ] **Step 1: Run non-executable structural checks**

Use file reads, globs, and content searches to confirm:

- `electron/`, `src/platform/electron-api.ts`, and `tsconfig.node.json` do not exist;
- all package scripts and Tauri lifecycle hooks point to the intended commands;
- package manifests contain no Electron packages;
- release scripts point only to the Tauri NSIS output;
- all `DesktopApi` methods remain implemented by the Tauri adapter;
- Tauri identifier and product name are final;
- configured icon files exist;
- capabilities remain least-privilege;
- legacy data files remain untouched.

- [ ] **Step 2: Check textual consistency only**

Run `git diff --check`. This checks whitespace errors only; do not report it as a build, type, or behavior verification.

- [ ] **Step 3: Request a fresh static code review**

Ask a fresh reviewer to compare the working tree with this plan and its spec. Explicitly forbid running tests, type checks, builds, or applications. Fix Critical and Important findings; record Minor findings for handoff.

- [ ] **Step 4: Report exact verification limits**

State that the following were not run:

```text
npm test
npm run test:rust
npm run typecheck
npm run build
npm run dev
```

Do not claim the application compiles, tests pass, NSIS packaging succeeds, or runtime behavior works after the Tauri-only cutover. State that no Git commit was created.
