# 原生浮窗实现计划（native-float）

设计：`design.md`（2026-11-03 审查修订版）。范围：chat + content 双域、桌面端、自动恢复上限 3。

## A. Main 进程（`packages/desktop/electron/`）

- [ ] A1 `float-window.ts` 新建：`Map<key, BrowserWindow>` 登记；`openFloatWindow({kind,projectId,itemKey,bounds?})` 幂等聚焦；
  建窗（无 parent、`frame:false`、`skipTaskbar:true`、`setAlwaysOnTop(true)`、同 webPreferences、`autoHideMenuBar`、
  `setWindowOpenHandler(deny)`、`setupContextMenu`、`will-navigate` 白名单）；`loadFile(..., {hash})` / dev 下 `loadURL(origin + hash)`；
  bounds 防抖落盘 + 关闭终写；`screen.getDisplayMatching` 恢复钳制；`closeForProject`；`restoreFor(ids)`（上限 3，只开 `open=true` 且已注册，
  跳过已存在）；`closeAllFloats()`；`listFloatKeys()`；`closed` 事件：用户关闭→`open=false`，`isQuitting()`→保留；
  崩溃（`render-process-gone` 非 clean-exit）→销毁 + 通知主窗口收回 overlay。verify：`float-window.test.ts` 全覆盖
- [ ] A2 `settings.ts`：`SettingsSchema` 加 `floatWindows?: Record<string, FloatWindowRecord>`，`get/set` helper。verify：`settings.test.ts` 既有通过
- [ ] A3 `window.ts`：抽 `resolveRendererLoad()`（dev `ELECTRON_RENDERER_URL` / prod `loadFile` 路径）供 A1 复用；主窗口 `closed` 接 `closeAllFloats()`。verify：既有测试通过
- [ ] A4 `main.ts`：`render-process-gone` 里非主窗口走 A1 崩溃路径；`window-all-closed` 不变。verify：单测行为（mock）
- [ ] A5 `ipc/project.ts`：dialog 类（`select-directory`/`confirmUnsafeLocation`/`show-save-dialog`）按 `event.sender` 取窗；
  主窗口专属（restore/warnings/`set-last-active`）不动；`close-project` 调 `closeForProject` + 删记录；
  `restore-projects` 成功后调 `restoreFloatWindows(ids)`（`restoreFloatWindows` 本身幂等：跳过已打开窗口，
  `refreshProjects` 重调无害，不需要 once 守卫）。verify：`ipc/project.test.ts` 补用例
- [ ] A6 `ipc/debug.ts`：`toggle-dev-tools`/`is-dev-tools-open`/`reload-renderer` 按 sender 取窗。verify：补单测
- [ ] A7 新建 `ipc/float-window.ts`（`float-window:open/close-self/navigate-main/closed/list`，open 参数校验：
  project 已注册 + `path` 经 `assertInsideProject`），`ipc/index.ts` 注册。verify：单测
- [ ] A8 `preload.ts` + `types.ts`：暴露 `floatWindow*` 方法。verify：`satisfies ElectronAPI` 编译通过

## B. Renderer（`packages/app` + `packages/desktop/src`）

- [ ] B1 `lib/host-bridge.ts`：`FloatWindowHostApi` + `HostBridge.floatWindow?`；`host-bridge-electron.ts` 实现（含 `list/onClosed` 事件订阅）；
  web bridge 不实现。verify：typecheck
- [ ] B2 `router.tsx`：顶层 `/float/chat/:projectId/:sessionId`、`/float/content/:projectId`（`?path=`），`errorElement` 复用。verify：typecheck
- [ ] B3 `FloatRoot`：`fetchConnection`、`loadSettings`、`busStore.init`、`I18nProvider`、`TooltipProvider`、`Toaster`、
  `ApprovalNoticeBridge`；不做 restoreProjects/last-route/`setLastActiveProject`/Update/NotificationClickBridge/ActivityBar。
  verify：单测断言副作用集合
- [ ] B4 `app-store.ensureProject(id)`：`GET /api/projects/:id/info` 写入 `projects`，不碰 active/lastOpened。verify：单测
- [ ] B5 `FloatProjectScope`：`ProjectProvider` + `useAgentBusRefresh`/`useSessionBusRefresh`/`useCustomTheme`。verify：随页面单测
- [ ] B6 `FloatChatPage` / `FloatContentPage` / `FloatTitleBar`（收回/展开/关闭，`app-region: drag`）。verify：单测 + typecheck
- [ ] B7 已弹出集合 store + 打开拦截：`openFloat`/`setFloatingChat` 前查集合，命中则 `floatWindow.open` 聚焦；
  `float-window:closed` 收回 overlay（bounds clamp）；失效项 `closeSelf({forget:true})`（仅 404/不存在）。
  verify：单测
- [ ] B8 `FloatingFrame` 弹出按钮（`bridge.floatWindow` 存在且非 pet 时显示），文案走 i18n（加载 i18n skill 补 key）。
  verify：单测 + i18n check

## C. 验证

- [ ] C1 `npm run lint`（增量无新 error；全仓 pre-existing warnings 不动）
- [ ] C2 `npm run build` + `npm run typecheck`
- [ ] C3 `npm test --workspace=packages/desktop`、`--workspace=packages/app`
- [ ] C4 E2E `e2e/native-float.spec.ts`：弹出 2 窗口且置顶；收回恢复 overlay；主窗关闭退出；重启恢复位置；
  浮窗不写 lastRoute/activeProject。verify：按 `docs/official/testing.md` 选影响面场景跑

## D. 收尾

- [ ] D1 doc-sync 自查：`project-structure.md`、architecture（desktop 多窗口 + IPC 取窗规则、renderer 路由）、
  `data-conventions.md`（`floatWindows`）、backlog（审批双通知、设置跨窗口同步）
- [ ] D2 commit；code-review skill 派 subagent 审查；反馈按 critical/important 修
- [ ] D3 PR 描述 + review report（修了什么、没修什么及原因）；等用户验收，不自行 merge
