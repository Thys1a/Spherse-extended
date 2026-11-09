# File System Access API 三层拦截实证

- 日期：2026-09-19（初版），2026-11-01（从 `2026-09-19-native-float/design.md` §二移出，内容不变）
- 背景：二期追加需求 4（网页的 File System Access API 在软件内继续可用）
- 结论速览：三层拦截（opaque origin / iframe 上下文 / 权限无人放行）互相独立；与原生浮窗共享“原生子窗口 + `http://localhost` 承载”这一半载体，另一半（权限放行、`allow-modals` 评估）各自独立，见“可行路径”。

## 一、规范层（WICG file-system-access）

picker 要求 ① 非 opaque origin ② 与顶层同源 ③ 用户手势；跨源子帧明确拒绝（`Cross origin sub frames aren't allowed to show a file picker`，Chromium 以 `IsFilePickerAllowedForCrossOriginSubframe` 执行，Electron 41 刚为内置 PDF 扩展加了同款放行 `PR #51042`，通用 iframe 无）。

## 二、本仓拦截对照

1. **opaque origin**：打包版 `loadFile`（`window.ts:26`）即 `file://`，spec 第一步直接 `SecurityError`；仅 dev（`ELECTRON_RENDERER_URL`）与 Web PWA（https）是非 opaque 源。
2. **iframe 上下文**：简易浏览器 `BrowserView.tsx:13`（跨源 iframe，`sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`）→ 跨源故无解；HtmlCard/srcDoc（同源继承）→ 沙箱缺 `allow-modals`（`HtmlCard.tsx:198`），文件弹窗被拦（`allow-modals` 为必要非充分条件）。
3. **权限无人放行**：Electron 41 虽支持 `fileSystem` 权限（`session.setPermissionRequestHandler`，`electron#41419`），`packages/desktop/electron` 全仓零实现；另 `preload.ts:16-88` 白名单无文件句柄透出，`contextIsolation:true + nodeIntegration:false`（`window.ts:16-20`）。

## 三、现有写链路（对照组，非 FS API）

服务端写门面早有（`server/src/routes/content.ts:33-166` 经 `pm.writeFile/createEntry/deletePath`），但 HTML 桥刻意只暴露读（`sdk/src/runtime/api.ts:27-30` + `handlers/api.ts:26-28` 白名单无写）；`HtmlCard.tsx:102-143` 的宿主保存按钮（`showSaveDialog + isPathInsideProject + saveContent`）iframe 内调不到。

## 四、可行路径（只记方向，不锁方案）

- 与原生浮窗共享载体：原生子窗口（`parent: mainWindow` + `alwaysOnTop`）+ `http://localhost:{serverPort}` 承载（localhost 为安全上下文 + 非 opaque，满足 spec ①②）。
- FS API 另需：主进程 `fileSystem` 权限放行（`setPermissionRequestHandler`，按路径/来源白名单）；HtmlCard/srcDoc 场景另需沙箱 `allow-modals` 安全评估；简易浏览器内的跨源页仍不可用（spec 硬限制，只能走顶层/子窗口打开）。
