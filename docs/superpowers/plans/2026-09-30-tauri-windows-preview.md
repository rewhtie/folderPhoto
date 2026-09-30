# Tauri Windows Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows-only Tauri development preview that shares the existing Vue frontend with Electron and implements complete Steam image scanning, controlled local-image access, collections persistence, local image selection, and collage saving.

**Architecture:** Extract the existing `window.imageLibrary` contract into a frontend platform boundary. Electron keeps its preload implementation, while Tauri installs an adapter before Vue mounts and delegates native work to Rust commands or official Tauri plugins. The Rust backend owns Steam parsing, recursive scanning, path authorization, and preview-only collections storage.

**Tech Stack:** Vue 3, TypeScript, Vite, Tauri 2, Rust, Serde, Tauri dialog/fs plugins

**Spec:** `docs/superpowers/specs/2026-09-30-tauri-windows-preview-design.md`

## Global Constraints

- Keep Electron development, packaging, release scripts, preload, IPC names, and backend code operational and structurally unchanged except for shared type imports.
- Target Windows only in this preview.
- Implement development preview only; do not connect Tauri to `release.cjs` or remove Electron.
- Use preview identifier `com.steampc.imagebrowser-tauri-preview` and isolated app data.
- Do not grant arbitrary shell execution, wildcard disk access, or unrestricted asset protocol scope.
- Canonicalize paths before authorization checks.
- Preserve existing `DesktopApi` argument and return structures.
- Unmigrated methods must reject with `当前 Tauri 验证版暂未迁移此功能`.
- Do not run tests, type checks, builds, `tauri dev`, or other runtime verification.
- Do not commit Git changes.
- Static file and import inspection is permitted.

## Review Focus

- A crafted `..`, junction, or symlink path must not escape an authorized image root.
- A corrupt or truncated `appinfo.vdf` must not panic or prevent valid later records from being parsed.
- Tauri startup must provide `loadCollections` before `App.vue` mounts.
- Electron preload must continue exposing the same API without importing Tauri runtime code.
- Large collage bytes must be written with `Uint8Array` through the fs plugin, not serialized through JSON command arguments.

---

### Task 1: Define the shared DesktopApi platform contract

**Files:**
- Create: `src/platform/desktop-api.ts`
- Create: `src/platform/electron-api.ts`
- Create: `src/platform/install-desktop-api.ts`
- Modify: `src/env.d.ts`
- Modify: `electron/preload.cts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces `DesktopApi`, `SteamCollection`, `SteamSettings`, `Achievement`, `AchievementResult`, `AchievementIcon`, `CacheIconsResult`, and `ExportResult`.
- Produces `getElectronDesktopApi(): DesktopApi`.
- Produces `installDesktopApi(): Promise<void>`.

- [ ] Move the interfaces currently declared in `src/env.d.ts` into exported declarations in `src/platform/desktop-api.ts`.
- [ ] Import existing domain contracts from `shared/common/contracts/image-library`, `shared/common/contracts/owned-games`, `shared/collections/model`, and `shared/tier-list/model`.
- [ ] Define `DesktopApi` with the exact current `window.imageLibrary` methods and signatures.
- [ ] Reduce `src/env.d.ts` to import `DesktopApi` and declare `Window.imageLibrary: DesktopApi`.
- [ ] Type the object in `electron/preload.cts` with `satisfies DesktopApi`; preserve every IPC channel and implementation.
- [ ] Implement `getElectronDesktopApi()` to return the preload object or throw `当前环境未提供 Electron DesktopApi`.
- [ ] Implement `installDesktopApi()` so Tauri dynamically imports `tauri-api`, Electron keeps the existing injected object, and an unsupported browser environment throws an initialization error.
- [ ] Change `src/main.ts` to await `installDesktopApi()` before `createApp(App).mount('#app')`.

### Task 2: Add Tauri dependencies and base project configuration

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`

**Interfaces:**
- Adds scripts `tauri:dev` and `tauri:build` without changing existing scripts.
- Adds JS dependencies `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs` and dev dependency `@tauri-apps/cli` at major version 2.
- Adds Rust dependencies `tauri`, `tauri-plugin-dialog`, `tauri-plugin-fs`, `serde`, `serde_json`, `percent-encoding`, and `mime_guess`.

- [ ] Add the Tauri JavaScript dependencies and scripts while preserving Electron dependencies and scripts.
- [ ] Configure `tauri.conf.json` with `beforeDevCommand: npm run dev`, dev URL `http://127.0.0.1:54088`, frontend dist `../dist`, preview identifier, one 1200×800 window, minimum 900×600, and inactive bundling for preview scope.
- [ ] Configure CSP to permit Tauri IPC, data/blob images, and the controlled `steam-image` protocol host only.
- [ ] Add capability permissions for core defaults, dialog open/save, and fs write-file only.
- [ ] Initialize dialog and fs plugins in `lib.rs`, register commands through `generate_handler!`, and call the library from `main.rs`.

### Task 3: Port the Steam appinfo and manifest parsers to Rust

**Files:**
- Create: `src-tauri/src/steam/mod.rs`
- Create: `src-tauri/src/steam/app_info.rs`
- Create: `src-tauri/src/steam/manifest.rs`

**Interfaces:**
- Produces `AppInfoEntry { name: String, app_type: String }`.
- Produces `parse_app_info(bytes: &[u8]) -> HashMap<String, AppInfoEntry>`.
- Produces `load_app_info_entries(librarycache_dir: &Path) -> HashMap<String, AppInfoEntry>`.
- Produces `parse_app_name(content: &str) -> Option<String>`.
- Produces `load_app_names(librarycache_dir: &Path) -> HashMap<String, String>`.

- [ ] Implement bounds-checked little-endian readers and v29 magic/string-table validation.
- [ ] Parse 60-byte app metadata and KV types `0x00`, `0x01`, `0x02`, `0x07`, and `0x08` without panics.
- [ ] Extract `common.name`, `common.type`, and `name_localized.schinese`, preferring Simplified Chinese.
- [ ] Skip a malformed app block while preserving other valid records.
- [ ] Port the existing Electron minimal v29 test vector into Rust `#[cfg(test)]` tests, including bad magic, bad offsets, and malformed record coverage; write tests but do not run them.
- [ ] Implement manifest directory derivation and case-insensitive `"name"` extraction without adding a regex dependency.

### Task 4: Implement complete image scanning and controlled local-image protocol

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/image_library.rs`
- Create: `src-tauri/src/protocol/mod.rs`
- Create: `src-tauri/src/protocol/local_image.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces serializable `ScanImagesOptions`, `ImageAsset`, and `ScanImagesResult` with camelCase fields matching TypeScript.
- Produces command `scan_images(state, directory_path, options) -> Result<ScanImagesResult, String>`.
- Produces command `authorize_local_images(state, paths) -> Result<Vec<String>, String>`.
- Produces cloneable `LocalImageAccess` backed by `Arc<Mutex<...>>`.
- Registers `steam-image` URI scheme.

- [ ] Copy the current target filename list into a Rust constant with exact case-insensitive matching.
- [ ] Implement recursive scanning, path validation, AppID extraction, extension filtering, file-size capture, appinfo/manifest name selection, DLC filtering, and relative-path sorting.
- [ ] Return absolute paths and an empty `fileUrl`; the TypeScript adapter fills URLs with `convertFileSrc`.
- [ ] Canonicalize and authorize a scan root only after validation succeeds.
- [ ] Implement explicit selected-file authorization for dialog-picked files.
- [ ] Decode and canonicalize protocol paths, permit descendants of authorized roots or exact authorized files, and return 403/404/500 correctly.
- [ ] Return correct image MIME, `Access-Control-Allow-Origin: *`, and `Cache-Control: no-cache`.
- [ ] Register shared authorization state for both commands and protocol handler.

### Task 5: Implement preview collections persistence

**Files:**
- Create: `src-tauri/src/commands/collections.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces commands `load_collections(app) -> Result<HashMap<String, Vec<String>>, String>` and `save_collections(app, collections) -> Result<(), String>`.

- [ ] Resolve Tauri `app_data_dir()` under preview identifier and use `collections.json`.
- [ ] Return an empty object for absent, unreadable, corrupt, or structurally invalid files.
- [ ] Validate every collection value as an array of strings.
- [ ] Create the data directory and save pretty UTF-8 JSON.
- [ ] Register both commands.

### Task 6: Implement the Tauri frontend adapter

**Files:**
- Create: `src/platform/tauri-api.ts`
- Modify: `src/platform/install-desktop-api.ts`
- Modify: `src/shared/common/local-image-picker.ts`

**Interfaces:**
- Produces `createTauriDesktopApi(): DesktopApi`.
- Uses Rust commands `scan_images`, `authorize_local_images`, `load_collections`, and `save_collections`.

- [ ] Implement directory selection with dialog plugin and normalize single/multiple return types.
- [ ] Invoke complete scan and map each returned absolute path to `convertFileSrc(path, 'steam-image')`.
- [ ] Implement collections command calls.
- [ ] Implement local-image selection with image filters, authorize selected paths, and return controlled protocol URLs.
- [ ] Implement collage save with save dialog and `writeFile(path, new Uint8Array(buffer))`.
- [ ] Implement every remaining `DesktopApi` method as a rejected promise with the exact preview-not-supported message.
- [ ] Install the adapter before Vue mounts when `window.__TAURI_INTERNALS__` exists.
- [ ] Keep `pickLocalImages()` using `window.imageLibrary.pickLocalImages()` so both backends remain transparent.

### Task 7: Statically audit compatibility and permissions

**Files:**
- Inspect: `src/platform/*.ts`
- Inspect: `src-tauri/**/*`
- Inspect: `electron/preload.cts`
- Inspect: `package.json`

**Interfaces:**
- Final startup paths: Electron preload or Tauri adapter, both satisfying `DesktopApi`.

- [ ] Statically resolve all relative TypeScript imports.
- [ ] Confirm the Electron preload still uses the same IPC channel names.
- [ ] Confirm Tauri code grants no shell permission, wildcard filesystem scope, or fixed WebView2 runtime.
- [ ] Confirm protocol path checks canonicalize before authorization.
- [ ] Confirm all unmigrated methods reject explicitly.
- [ ] Confirm existing Electron scripts and release script are unchanged.
- [ ] Confirm Rust test modules exist but report that they were not run.
- [ ] Report explicitly that no tests, type checks, builds, `tauri dev`, or runtime verification were executed.
