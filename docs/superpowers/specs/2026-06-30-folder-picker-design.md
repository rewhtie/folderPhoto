# 文件夹选择功能设计

## 背景

当前应用默认填入 Steam librarycache 路径：

```text
C:\Program Files (x86)\Steam\appcache\librarycache
```

该路径在不同电脑上可能不存在。用户需要一个系统文件夹选择器来选择实际图片目录，避免手动输入路径和路径不存在的问题。

## 目标

新增“选择文件夹”功能：

- 用户点击“选择文件夹”按钮。
- 应用打开系统目录选择器。
- 用户选择目录后，输入框自动填入该目录路径。
- 应用自动扫描该目录中的图片。
- 用户取消选择时，当前路径、图片列表和状态不变。

## 非目标

本次不实现以下功能：

- 自动查找 Steam 安装目录。
- 启动时自动弹出文件夹选择器。
- 递归扫描子目录。
- Steam AppID 或游戏名识别。
- 网络封面下载。

## 架构

### Electron 主进程

主进程新增 IPC 方法：

```ts
selectImageDirectory(): Promise<string | null>
```

该方法使用 Electron `dialog.showOpenDialog`，并设置：

```ts
properties: ['openDirectory']
```

返回规则：

- 用户选择目录：返回第一个目录的绝对路径。
- 用户取消选择：返回 `null`。

### Electron preload

preload 新增安全 API：

```ts
window.imageLibrary.selectDirectory(): Promise<string | null>
```

渲染进程仍不能直接访问 Node.js `fs`、`path` 或 Electron 原生 API。

### Vue 渲染进程

路径输入区改为三个控件：

```text
[目录路径输入框] [选择文件夹] [读取图片]
```

交互流程：

1. 用户点击“选择文件夹”。
2. 应用调用 `window.imageLibrary.selectDirectory()`。
3. 如果返回目录路径，应用更新输入框并调用现有 `scanImages()`。
4. 如果返回 `null`，应用不改变现有状态。

## 错误处理

- 打开文件夹选择器失败时，页面显示“选择文件夹失败”。
- 用户取消选择时，不显示错误。
- 默认路径不存在时，保留现有目录不存在错误，但文案补充“你也可以点击选择文件夹”。

## 验证

实现后验证：

1. 点击“选择文件夹”能打开系统目录选择器。
2. 取消选择不会清空输入框，也不会清空当前图片列表。
3. 选择包含图片的目录后，页面自动展示图片网格。
4. 选择空目录后，页面显示空状态。
5. `npm test` 通过。
6. `npm run build` 通过。
