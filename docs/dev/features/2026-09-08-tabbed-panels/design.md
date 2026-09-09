# 标签页式窗口（Tab 式多面板）

> 状态：**待实施（次优先，独立分支）**。决策：架构 B（后台 tab 并行保活）；持久化走 localStorage（`spherse:tabs`）；默认打开走 tab，右键菜单保留「浮窗打开」（显式 float 路径不变）；首期即做。

## 背景

用户希望以浏览器式标签页并行打开多个面板（多会话 / 内容页 / 浏览器页），替代或补充当前「ActivityBar 导航 + floating 浮窗」的面板组织方式。

## 现状

- 单 `BrowserWindow`（`packages/desktop/electron/window.ts:10-21`）+ renderer hash router：`/`、`project/:projectId`（子路由 `chat/:sessionId`、`content`、`browser`）（`packages/app/src/router.tsx`）。
- 多面板现状 = ActivityBar 导航 + 三类 floating（floating-chat / floating-content-browser / floating-browser，`FEATURE_HOST_MATRIX` 中均为 ELECTRON_ONLY，web 端降级为跳转）。
- **floating 的渲染模式是「路由外独立渲染」**：`FloatingChatContainer` 直接渲染 `<Chat hideHeader>`，`FloatingContentBrowserContainer` 直接渲染只读 `ContentView`，均经 portal 挂 body，与路由无关（docked-chat 同理）。
- streaming store / bus store 全局单例，chat 滚动位置按 session 持久（`streaming-store` 的 `scrollPosition`）——后台 tab 恢复无需新工作。
- floating 的调用入口是 SDK action handler（`ui-sdk/handlers/` 下 `float-session.ts` / `float-content.ts` / `open-file.ts` / `open-chat.ts` / `open-session.ts`），非裸 store 调用；`content`/`browser` 路由带 query（`?path=` / `?url=`）。

## 方案比选（Electron 41）

| 方案 | 原理 | 评价 |
|---|---|---|
| **A. renderer 内 tab 组件（推荐）** | React TabStrip + tab 状态 store + 路由联动 | 与现状最贴合：Spherse 是工作台型 SPA，标签语义即「多路由面板并行」；共享全部全局 store/WS/主题；改动小 |
| B. `BaseWindow` + N 个 `WebContentsView` | Electron 30+ 官方多视图（BrowserView 已废弃） | 真进程隔离；但 tab 条需主进程自绘、每个 view 是独立 renderer——HostBridge / 全局 store / ActivityBar / 主题跨 view 重建，改造大；适合「多项目独立空间」类浏览器壳需求，当前无此场景 |
| C. `webview` 标签 + electron-tabs 库 | webview 每标签独立进程 | webview tag 不受官方推荐、社区库半停滞，排除 |
| D. 原生 `tabbingIdentifier` / `addTabbedWindow` | macOS 原生 tab | 仅 macOS，Windows 无效，排除 |

## 方案 A 实施方案（已确认，架构 B：并行保活）

### 数据与状态

- 新增 `features/tabs/tab-store.ts`（zustand，`byProject` 结构对齐现有 floating store）：
  ```
  byProject: Record<projectId, { tabs: Tab[]; activeTabId: string | null }>
  Tab = { id: string; kind: "chat"|"content"|"browser"|"home"; projectId: string; label: string; sessionId?; filePath?; url? }
  openTab(projectId, spec)   # 按身份（sessionId/filePath/url）复用或新建
  closeTab(id) / activate(id) / reorder(from, to) / clearProject(projectId)
  ```
- `id` 稳定（uuid）；复用按「身份字段」派生（sessionId / filePath / url），不用整条 route 字符串（`content`/`browser` 带 query）。
- 持久化：localStorage（key `spherse:tabs`），不走 `AppSettings`/IPC（对齐现有 floating store）。

### 渲染架构（TabContainer 并行渲染，对齐 floating 模式）

- `ProjectScope` 的 `main` 区域：`<Outlet/>` 替换为 `<TabStrip/> + <TabContainer/>`（`useFeature("tabs")` 关时回退 `<Outlet/>`；`router.tsx` 子路由 element 置空占位，保留 URL 结构供深链匹配）。
- `TabContainer` 按 tab kind 独立渲染现成组件（全部已是可独立渲染的薄封装），`activeTabId` 控制 `display:none` 保活，后台 DOM 不卸载：
  - chat → `<Chat>`（带 header；session/agent 解析参照 `FloatingChatContainer`）
  - content → `<ContentBrowser>`（完整编辑版；filePath 来自 tab，逻辑参照 `ContentBrowserPage`）
  - browser → `<BrowserPageView>`
  - home → 项目首页（`WelcomePage`）
- 进入 project 初始化：无 tab 时建一个 home tab；`setProjectLastRoute` 改由 activeTab 投影替代。
- 关闭 tab 不等于关闭会话：chat WS attach 由组件挂载驱动（与 floating chat 相同语义），后台 tab 流式更新照常入全局 store。

### 路由投影（tab store 为源，route 为投影，双向同步）

- activeTab 变化 → `navigate(route, { replace: true })` 仅投影 URL。
- `location` 变化（浏览器后退、深链、SDK navigate）→ 反向同步 `openTab`/`activate`；用 ref 标记「store 驱动的 navigate」跳过反向同步，避免循环。现有 `navigate(...)` 调用点无需改动。

### 与 floating 面板的关系（已确认：默认 tab + 右键浮窗）

- tabs 开启时 SDK handler（`openChat`/`openFile`/`floatContent`/`openSession`，含第三类 floating-browser 的 `openFloat`）默认走 `openTab`；显式 `float` 参数走原 floating store 路径。
- 右键菜单保留「浮窗打开」（复用现有 `floatSession` 项，无需新增）；floating-* feature 保留，不删除。

### Feature gate 与范围

- 新增静态 feature `tabs`（ALL_HOSTS；electron + web 双开，web 端同样受益于 tab 收口移动端跳转）。
- TabStrip 放 `ProjectScope` 的 `main` 顶部（SidePanel 右侧）；支持拖拽排序。
- tab 按 project 隔离（`byProject`）；不做跨窗口拖出（detach to window）。
- 首期范围：chat / content / browser / 项目首页四类 tab。

### 风险

- 路由 ↔ tab 双向同步的循环防护（ref 标记 store 驱动的 navigate）。
- Iframe 保活的内存代价（后台 tab 不卸载）；chat label 需调用方先查 session title 或进入后异步解析。
- `useChatScroll` 无需新工作（沿用现有 per-session scrollPosition）。

## 验证思路（实施时）

- tab-store 单测：openTab 复用/新建、closeTab 激活转移、reorder。
- 组件测试：TabStrip 渲染/激活/关闭；路由投影（激活 tab → navigate replace）。
- 手动：多 chat tab 并行流式、content 编辑态切 tab 保留、browser iframe 不重载、右键浮窗、重启后 tab 恢复。
