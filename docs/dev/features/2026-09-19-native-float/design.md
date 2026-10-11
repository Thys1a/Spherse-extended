# 原生浮窗与 File System Access API 调研（native-float）

> 状态：**只记调研结果，未立项、无方案锁定**。日期 2026-09-19。
> 背景：二期追加需求 2（窗口外 pin 浮窗，已选原生窗口置顶方向）、4（网页的 File System Access API 在软件内继续可用）。
> 结论速览：两者都指向同一载体——Electron 原生子窗口 + `http://localhost` 承载；合并立项最划算。

## 一、浮窗现状实证（行号为本地实测）

- 两浮窗域全是主窗口内 Portal overlay：`FloatingContentBrowserContainer.tsx:55-88`（`createPortal(document.body)` + `FloatingFrame` + 只读 `ContentView :70-84`）、`FloatingChatContainer.tsx:57,99,127`（同 portal + 内嵌 `Chat`）。
- 按项目隔离 + 持久化不对称：content 侧 `floating-content-browser/store.ts:12`（`byProject`）、`:25-46`（localStorage 读写回）、`clearProject :121-128`（仅关项目时清，`project-lifecycle.ts:17-36`）；chat 侧 `floating-chat/store.ts:11,17-29`（`byProject` 但只写不读，重载必丢）；切换项目只隐藏不清理（`use-project-actions.ts:34-38`），E2E 命名误导（切走 `count(0)`、切回仍可见，`floating-chat.spec.ts:376,435-443`）。
- 主壳单窗口：`desktop/electron/window.ts:8-30`（单例 `mainWindow 1200x800`，无第二窗口/`alwaysOnTop`）；`main.ts:17-35`（装配：fixPath → server → createWindow → IPC → 更新检查 → tunnel）；`registerAllIpc(getMainWindow)`（`:24`）与 `setupContextMenu` 均绑定单窗口；`window-all-closed → gracefulShutdown`（`:59-61`）。
- `FloatingFrame` 的 `pinned` 只是侧栏 pin（`FloatingFrame.tsx:55`，仅切 z-index `:86,100`），与 OS 置顶无关；拖拽被钳在窗口内（`use-drag.ts:50-51,69-70`，出界冻住 `:43` 注释）。

## 二、File System Access API 三层拦截实证

- 规范层（WICG file-system-access）：picker 要求 ① 非 opaque origin ② 与顶层同源 ③ 用户手势；跨源子帧明确拒绝（`Cross origin sub frames aren't allowed to show a file picker`，Chromium 以 `IsFilePickerAllowedForCrossOriginSubframe` 执行，Electron 41 刚为内置 PDF 扩展加了同款放行 `PR #51042`，通用 iframe 无）。
- 本仓拦截对照：
  1. **opaque origin**：打包版 `loadFile`（`window.ts:26`）即 `file://`，spec 第一步直接 `SecurityError`；仅 dev（`ELECTRON_RENDERER_URL`）与 Web PWA（https）是非 opaque 源。
  2. **iframe 上下文**：简易浏览器 `BrowserView.tsx:13`（跨源 iframe，`sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`）→ 跨源故无解；HtmlCard/srcDoc（同源继承）→ 沙箱缺 `allow-modals`（`HtmlCard.tsx:198`），文件弹窗被拦（`allow-modals` 为必要非充分条件）。
  3. **权限无人放行**：Electron 41 虽支持 `fileSystem` 权限（`session.setPermissionRequestHandler`，`electron#41419`），`packages/desktop/electron` 全仓零实现；另 `preload.ts:16-88` 白名单无文件句柄透出，`contextIsolation:true + nodeIntegration:false`（`window.ts:16-20`）。
- 现有写链路（对照组，非 FS API）：服务端写门面早有（`server/src/routes/content.ts:33-166` 经 `pm.writeFile/createEntry/deletePath`），但 HTML 桥刻意只暴露读（`sdk/src/runtime/api.ts:27-30` + `handlers/api.ts:26-28` 白名单无写）；`HtmlCard.tsx:102-143` 的宿主保存按钮（`showSaveDialog + isPathInsideProject + saveContent`）iframe 内调不到。

## 三、可行路径（只记方向，不锁方案）

- 共同载体：原生子窗口（`parent: mainWindow` + `alwaysOnTop`）+ `http://localhost:{serverPort}` 承载（server 在 main 就绪，`main.ts:21`；localhost 为安全上下文 + 非 opaque，满足 spec ①②）。
- FS API 另需：主进程 `fileSystem` 权限放行（`setPermissionRequestHandler`，按路径/来源白名单）；HtmlCard/srcDoc 场景另需沙箱 `allow-modals` 安全评估；简易浏览器内的跨源页仍不可用（spec 硬限制，只能走顶层/子窗口打开）。
- 子窗口改动面记录：renderer 新增顶层浮窗路由（现挂 `ProjectScope` 内，需上提）→ IPC 改多窗口（`registerAllIpc` 现绑定单窗口）→ 关闭策略（`window-all-closed` 即退，主窗关后浮窗孤儿）→ 位置持久化复用现有 `byProject` store；子窗口带 `projectId` 参数，切换项目重载路由即可复用“切换不丢失”的 localStorage 基础。
