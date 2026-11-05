# 原生浮窗调研（native-float）

> 状态：**只记调研结果，未立项、无方案锁定**。日期 2026-09-19。
> 背景：二期追加需求 2（窗口外 pin 浮窗，已选原生窗口置顶方向）。
> File System Access API 部分已移出为独立文档：`../2026-11-01-file-system-access/research.md`（含三层拦截实证与权限放行路径；与本篇共享“原生子窗口 + `http://localhost` 承载”这一半载体）。

### 状态注记（2026-11-01，v1.0.4 排期复核）

- 实现状态：**零实现**——`window.ts` 仍是单例主窗口，无 `alwaysOnTop`、无 `setPermissionRequestHandler`、无第二窗口；两浮窗域仍是主窗 Portal overlay。
- 本目录 design.md 头部自声明“只记调研结果，未立项”：v1.0.4 若要做，**第一步是先立项出正式方案**（路由上提、`ProjectScope` 外浮窗路由、IPC 多窗口化、`window-all-closed` 语义、位置持久化），本注记不代替立项。
- FS API 部分（`allow-modals` 沙箱评估）可拆分为第二步独立排期。

## 一、浮窗现状实证（行号为本地实测）

- 两浮窗域全是主窗口内 Portal overlay：`FloatingContentBrowserContainer.tsx:55-88`（`createPortal(document.body)` + `FloatingFrame` + 只读 `ContentView :70-84`）、`FloatingChatContainer.tsx:57,99,127`（同 portal + 内嵌 `Chat`）。
- 按项目隔离 + 持久化不对称：content 侧 `floating-content-browser/store.ts:12`（`byProject`）、`:25-46`（localStorage 读写回）、`clearProject :121-128`（仅关项目时清，`project-lifecycle.ts:17-36`）；chat 侧 `floating-chat/store.ts:11,17-29`（`byProject` 但只写不读，重载必丢）；切换项目只隐藏不清理（`use-project-actions.ts:34-38`），E2E 命名误导（切走 `count(0)`、切回仍可见，`floating-chat.spec.ts:376,435-443`）。
- 主壳单窗口：`desktop/electron/window.ts:8-30`（单例 `mainWindow 1200x800`，无第二窗口/`alwaysOnTop`）；`main.ts:17-35`（装配：fixPath → server → createWindow → IPC → 更新检查 → tunnel）；`registerAllIpc(getMainWindow)`（`:24`）与 `setupContextMenu` 均绑定单窗口；`window-all-closed → gracefulShutdown`（`:59-61`）。
- `FloatingFrame` 的 `pinned` 只是侧栏 pin（`FloatingFrame.tsx:55`，仅切 z-index `:86,100`），与 OS 置顶无关；拖拽被钳在窗口内（`use-drag.ts:50-51,69-70`，出界冻住 `:43` 注释）。

## 二、可行路径（只记方向，不锁方案）

- 载体：原生子窗口（`parent: mainWindow` + `alwaysOnTop`）+ `http://localhost:{serverPort}` 承载（server 在 main 就绪，`main.ts:21`；localhost 为安全上下文）。
- 子窗口改动面记录：renderer 新增顶层浮窗路由（现挂 `ProjectScope` 内，需上提）→ IPC 改多窗口（`registerAllIpc` 现绑定单窗口）→ 关闭策略（`window-all-closed` 即退，主窗关后浮窗孤儿）→ 位置持久化复用现有 `byProject` store；子窗口带 `projectId` 参数，切换项目重载路由即可复用“切换不丢失”的 localStorage 基础。



# 原生浮窗方案（已立项，2026-11-03 审查修订）

**前提更正**：调研 §二设想子窗口走 `http://localhost:{serverPort}` 加载页面，这条路不可行。Fastify 没有静态文件服务，非 API 路径都返回 404（`server/src/index.ts:119-121`）；生产环境主窗口是 `file://`（`window.ts:51`），换 origin 后 localStorage 会分开。所以子窗口复用主窗口的加载方式，只换 hash 路由，两个窗口同源，localStorage 共享。

### 1. 范围与交互

- chat 和 content 两个浮窗域都做，只做桌面端。窗口内浮窗保留，web 端继续用。
- `FloatingFrame` 标题栏加"弹出"按钮，只在 `bridge.floatWindow` 存在且不是 pet 模式时显示。
- 弹出：从窗口内浮窗的 store 移除这一项，再打开原生窗口。收回：关闭原生窗口，按 clamp 后的位置重新打开窗口内浮窗。同一项任何时刻只在一处出现，两窗口之间不做状态同步。
- 浮窗内再点"浮窗"（如浮窗里 Chat 的 quick-link）：overlay 条目建在共享 localStorage，主窗口负责渲染。接受该行为，不做拦截。
- 主窗口的打开动作（点文件、开 session）先查"已弹出集合"：命中则聚焦已有的原生窗口，不再建 overlay，避免同一项两处并存。

### 2. Main 进程：新建 `desktop/electron/float-window.ts`

- **登记**：`Map<key, BrowserWindow>`，`key = ${kind}:${projectId}:${itemKey}`（不透明字符串，禁止解析；`closeForProject`/恢复按记录的 `projectId` 比对）。`open` 幂等：同 key 已打开只 `focus`。
- **建窗**：
  - 不设 `parent`，`frame:false`，`skipTaskbar:true`，`setAlwaysOnTop(true)`。
  - `webPreferences` 与主窗口一致（同 preload、`contextIsolation:true`、`nodeIntegration:false`）。
  - `autoHideMenuBar:true`，`setWindowOpenHandler(deny)`，`setupContextMenu(win)`，`will-navigate` 白名单（只允许自身加载地址）。
- **加载**：把 `window.ts:48-52` 抽成 `loadRenderer(win, hash)`，路由为 `#/float/chat/:projectId/:sessionId` 和 `#/float/content/:projectId?path=`（path 做 `encodeURIComponent`）。
- **持久化**：electron-store 新增 `floatWindows: Record<key, { kind, projectId, itemKey, bounds, open, updatedAt }>`（未发布格式，不写迁移）。
  - `move`/`resize` 防抖落盘，关闭时再写一次终值（只靠关闭时写，崩溃即丢）。
  - 恢复时用 `screen.getDisplayMatching` 做范围检查，显示器变化后窗口不落到屏幕外。
- **生命周期**：
  - 用户关闭（自绘按钮或 Alt+F4）：`open=false`，保留 bounds。
  - 应用退出：复用 `lifecycle.js` 的 `isQuitting()` 判断，退出路径（`before-quit` / 主窗口 `closed`）下 `closeAll()` 不改 `open`，供下次恢复。
  - 主窗口 `closed`（`window.ts:54`）时连锁 `closeAllFloats()`，否则 `window-all-closed` 不触发、`gracefulShutdown` 不执行；tray 的 `close → hide`（`tray.ts:95-105`）属于隐藏，浮窗保留。`window-all-closed → gracefulShutdown` 本身不变。
  - `close-project` 里调 `closeForProject(id)` 并删除该项目全部记录。
- **自动恢复**：不在 `did-finish-load` 恢复——项目只在 `restore-projects` IPC 里注册（`server.ts:32` 启动时 `registeredProjects` 为空），早恢复会 404。改为 main 进程在**每次 `restore-projects` 成功后**调 `restoreFloatWindows(registeredIds)`；`restoreFloatWindows` 本身幂等（跳过已打开窗口），`refreshProjects` 重调（bus 重连）无害。上限 **3 个**，按 `updatedAt` 取最近；`open=true` 但项目未注册的记录删除（项目已移除），`open=false` 的保留供手动重开。
- **失效项清理**：只在明确的 404 / 文件不存在时由浮窗 renderer 调 `closeSelf({ forget:true })` 删记录，网络错误不删。content 侧复用 `FloatingContentBrowserContainer.tsx:47-51` 的判断，chat 侧复用 `FloatingChatManager` 的 session 消失逻辑（`:27-31`）。
- **崩溃兜底**：浮窗 renderer 崩溃（main 的 `render-process-gone` 对非主窗口直接 return，`main.ts:64`）时，销毁该浮窗并经 `float-window:closed` 通知主窗口把条目收回 overlay，不做自动 reload。

### 3. IPC / preload / HostBridge

- **新增通道**：`float-window:open`（幂等聚焦）、`float-window:close-self({forget?})`、`float-window:navigate-main`（main 转发给主窗口做 focus + 路由跳转，用于展开/`onOpenSession`/`onNavigateToPath`，主窗口若被 tray 隐藏先 `showMainWindow`）、`float-window:closed`（main 通知主窗口，收回 overlay / 崩溃回退共用）、`float-window:list`（主窗口 hydration"已弹出集合"用）。
- **参数校验**：`open` 前校验 `projectId` 已在 `openProjects` 注册，`path` 用 `assertInsideProject` 校验。
- **取窗规则**：
  - 按调用窗口取（`BrowserWindow.fromWebContents(event.sender)`）：dialog 类（含 `show-save-dialog`）、`debug.ts` 的 devtools/reload。
  - 保持主窗口专属：`restore-projects`、unsafe 警告、`set-last-active-project`、mobile 广播、notification 点击、updater 事件。
- **HostBridge**：增加可选字段 `floatWindow?: { open, closeSelf, navigateMain, onClosed, list }`，web bridge 不实现。

### 4. Renderer：`packages/app`

- **新增顶层路由 `/float/*`**（与 `/` 平级），挂载 `FloatRoot`：
  - 执行：`fetchConnection`、`loadSettings`、`busStore.init`、`ApprovalNoticeBridge`（只覆盖浮窗自己 attach 的 session）、`I18nProvider`、`TooltipProvider`、`Toaster`。
  - 跳过：`restoreProjects`、last-route 跳转、`setLastActiveProject`、`UpdateNoticeBridge`、`NotificationClickBridge`、`ActivityBar`。
- **app-store 新增 `ensureProject(id)`**：调 `GET /api/projects/:id/info` 取 `projectRoot` 供 `ProjectProvider` 用。不走 `openProject`（会覆盖 lastOpened / activeProject，见 `app-store.ts:73-75`）。
- **新增 `FloatProjectScope`**：提供 `ProjectProvider`，挂 `useAgentBusRefresh`、`useSessionBusRefresh`、`useCustomTheme`；绝不调用 `setActiveProject` / `setProjectLastRoute`（`ProjectScope.tsx:49-51,72-78`）。
- **页面**：`FloatChatPage`（`useProjectCatalog` 取 agent，渲染 `<Chat hideHeader>`，session 消失自动 `closeSelf({forget:true})`）、`FloatContentPage`（`useContentFile` + 只读 `ContentView`），共用 `FloatTitleBar`（`app-region: drag` + no-drag 按钮：收回、展开、关闭）。
- **收回 clamp**：`float-window:closed` 的 bounds 按主窗口视口 clamp 后再写入 overlay store，尺寸设上限，不直接复用原生窗口大小。
- 新标题栏文案走 i18n，不硬编码。

### 5. 已知限制与取舍（记进 backlog）

- 同一 session 两处同时打开时，审批 toast + 系统通知各出现一次；另被弹出后主窗口 detach，仅主窗口挂 bridge 会丢通知，所以浮窗也挂。
- locale / 主题切换不跨窗口实时同步（两个 JS context，无 storage 监听）；`FloatRoot` 只保证初始语言和项目主题正确。
- 每个浮窗 = 一份完整 renderer + bus WS + chat WS + 独立 query cache，内存与连接数随窗口线性增长。
- localStorage 同源共享是方案成立的前提（生产 `file://` + 开发 Vite 同源），需 E2E 覆盖验证。

### 6. 验证

- **desktop 单测**：同 key 幂等聚焦；用户关闭 `open=false`、退出保留 `open`；`closeForProject` 删记录；恢复只取已注册项且上限 3；屏幕范围检查；崩溃路径销毁 + 通知主窗口。
- **app 单测**：`FloatRoot` 不触发主窗口专用副作用（不断言 last-route / activeProject 写入）；session 失效调 `closeSelf({forget:true})`；打开动作命中已弹出集合时聚焦而不建 overlay。
- **E2E**：弹出后 `getAllWindows()` 为 2 且 `isAlwaysOnTop()`；收回后窗口内浮窗恢复；主窗口关闭后应用退出；重启后浮窗按原位置恢复（固定 userData）。

### 7. 文档同步

- `project-structure.md`（新增文件：`float-window.ts`、`FloatRoot`/`FloatProjectScope`/两页面/`FloatTitleBar`、`plan.md`）
- architecture：desktop 多窗口 + IPC 取窗规则、renderer 路由
- `data-conventions.md`（settings.json 的 `floatWindows`）
- 调研 §二 localhost 结论已由本方案"前提更正"推翻
- backlog：审批双通知、设置跨窗口实时同步

