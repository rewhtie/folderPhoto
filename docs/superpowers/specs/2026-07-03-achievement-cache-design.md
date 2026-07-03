# 成就数据缓存设计

## 目标

将成就获取统一为 Web API + 永久文件缓存模式：首次加载走 Steam Web API，之后直接读缓存文件，不再提供本地 fallback 和手动刷新。

## 背景

当前成就加载逻辑（`GameDetail.vue:loadAchievements`）每次点击都重新请求 Steam API，没有持久化缓存。API 失败时回退到本地 `userdata` 文件（缺少图标和名称）。用户希望：API 数据只请求一次，后续直接读缓存。

## 架构

### 数据流

```
用户点「加载成就」
  → main进程: achievements:fetch-api
    → loadCachedAchievements(appId)    // 检查缓存文件
      → 命中 → 直接返回 { source: 'api', achievements }
      → 未命中 → fetchApiAchievements(appId, apiKey, steamId)
                  → saveAchievementCache(appId, result)   // 写入缓存
                  → 返回 result
```

### 缓存文件位置

与图标缓存同级：`<appDirectory>/achievements/<appId>.json`

文件内容为 `AchievementResult` 的 JSON 序列化，包含完整的成就列表（含图标 URL、解锁状态等）。

## 改动清单

### 1. `electron/achievementStore.ts`

新增三个函数：

- `getCachePath(appId: string): string` — 返回 `<appDirectory>/achievements/<appId>.json`
- `loadCachedAchievements(appId: string): Promise<AchievementResult | null>` — 读取缓存，文件不存在返回 `null`
- `saveAchievementCache(appId: string, result: AchievementResult): Promise<void>` — 写入 JSON 文件（自动创建 achievements 目录）

需注入 `appDirectory`，与 `achievementCache.ts` 使用相同目录。

### 2. `electron/main.ts`

修改 `achievements:fetch-api` IPC handler（约 line 139）：

```
原: loadSettings → fetchApiAchievements → 返回
新: loadCachedAchievements(appId)
      → 有缓存 → 返回缓存
      → 无缓存 → loadSettings → fetchApiAchievements → saveAchievementCache → 返回
```

新增一个 IPC handler `achievements:has-cache` 供前端判断缓存状态（可选，用于 UI 提示）。

### 3. `src/components/GameDetail.vue`

简化 `loadAchievements()`：
- 移除本地 fallback 分支（lines 52-66）
- 移除 `loadLocalAchievements` 调用
- 保留单一路径：`fetchApiAchievements` → 显示 → 后台缓存图标
- `achievementError` 消息简化：API 失败直接显示错误，不再提示"需要配置 Web API"

### 4. `electron/preload.cts`

- 移除 `loadLocalAchievements` 的暴露
- 保留 `fetchApiAchievements`、`cacheAchievementIcons`、`openAchievementCacheDir`

### 5. `src/env.d.ts`

- 移除 `loadLocalAchievements` 类型声明

## 不变部分

- `achievementCache.ts`（图标缓存）— 逻辑不变
- `settingsStore.ts` — 逻辑不变
- 图标缓存触发逻辑（`GameDetail.vue:cacheIcons`）— 不变
- UI 布局样式 — 不变

## 错误处理

- 缓存文件读取失败（JSON 解析错误）→ 重新请求 API 并覆盖写入
- API 请求失败 → 直接显示错误，不回退本地
- settings 未配置（无 apiKey/steamId）→ 显示"需要配置 Web API"错误
