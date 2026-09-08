# 标签页式窗口（Tab 式多面板）

> 状态：**调研完成，未实施**。本文沉淀可行性结论与方案 A 草案，供后续立项。

## 背景

用户希望以浏览器式标签页并行打开多个面板（多会话 / 内容页 / 浏览器页），替代或补充当前「ActivityBar 导航 + floating 浮窗」的面板组织方式。

## 现状

- 单 `BrowserWindow`（`packages/desktop/electron/window.ts:10-21`）+ renderer hash router：`/`、`project/:projectId`（子路由 `chat/:sessionId`、`content`、`browser`）（`packages/app/src/router.tsx`）。
- 多面板现状 = ActivityBar 导航 + floating chat / floating content browser（`FEATURE_HOST_MATRIX` 中 `floating-*` 为 ELECTRON_ONLY，web 端降级为跳转）。
- streaming store / bus store 全局单例，WS 按会话引用计数 attach/detach——**多面板并行消费同一会话已是既有能力**（floating chat 先例）。

## 方案比选（Electron 41）

| 方案 | 原理 | 评价 |
|---|---|---|
| **A. renderer 内 tab 组件（推荐）** | React TabStrip + tab 状态 store + 路由联动 | 与现状最贴合：Spherse 是工作台型 SPA，标签语义即「多路由面板并行」；共享全部全局 store/WS/主题；改动小 |
| B. `BaseWindow` + N 个 `WebContentsView` | Electron 30+ 官方多视图（BrowserView 已废弃） | 真进程隔离；但 tab 条需主进程自绘、每个 view 是独立 renderer——HostBridge / 全局 store / ActivityBar / 主题跨 view 重建，改造大；适合「多项目独立空间」类浏览器壳需求，当前无此场景 |
| C. `webview` 标签 + electron-tabs 库 | webview 每标签独立进程 | webview tag 不受官方推荐、社区库半停滞，排除 |
| D. 原生 `tabbingIdentifier` / `addTabbedWindow` | macOS 原生 tab | 仅 macOS，Windows 无效，排除 |

## 方案 A 草案（未实施）

### 数据与状态

- 新增 `features/tabs/tab-store.ts`（zustand）：
  ```
  tabs: Array<{ id: string; route: string; label: string; kind: "chat"|"content"|"browser"|"home" }>
  activeTabId: string | null
  openTab({ route, label, kind, reuseKey? })   # reuseKey 相同则聚焦已有 tab
  closeTab(id) / activate(id) / reorder(from, to)
  ```
- `id` 稳定（uuid）；`reuseKey` 支撑「同一会话/文件只开一个 tab」语义（对齐 floating 的 `byProject` 单例）。

### 布局与联动

- `App.tsx` 的 `<Outlet/>` 外包一层 TabStrip + tab 容器；激活 tab → `navigate(tab.route)`；路由变化（菜单/SDK openSession 等）→ `openTab` 聚焦或新建。
- TabStrip 放顶部（ActivityBar 之上或替代其导航职责，实施时定）；支持拖拽排序（复用 floating-frame 的 drag 基建或现成 dnd 库）。
- 关闭 tab 不等于关闭会话：chat WS attach 由路由挂载/卸载自然驱动（`useChatSession` 引用计数），后台 tab 的流式更新照常入 store。

### 与 floating 面板的关系

- 方向：**tab 作为 floating 的收口替代**——`floatSession`/`floatContent` 在 tab 模式开启时改为「聚焦/新建对应 tab」（feature gate 切换），减少两套面板机制并行。
- 保留 floating 的独立小窗场景或整体移除，实施时决策。

### Feature gate 与范围

- 新增 feature `tabs`（electron + web 双开；web 端同样受益于 tab 收口移动端跳转）。
- 首期范围：chat / content / browser / 项目首页四类 tab；不做跨窗口拖出（detach to window）。

### 风险

- 路由 ↔ tab 状态双向同步需单一真相（tab store 为源，route 为投影），避免历史导航（浏览器后退）与 tab 激活打架。
- `useChatScroll` 的滚动位置恢复按 tab 维度保存（沿用现有 per-session scrollPosition 即可）。
- HtmlCard / preview iframe 在 tab 切换时若卸载会丢 iframe 状态——优先 `display:none` 保活而非卸载（或接受重载，实施时按内存取舍）。

## 验证思路（实施时）

- tab-store 单测：openTab 复用/新建、closeTab 激活转移、reorder。
- 组件测试：TabStrip 渲染/激活/关闭；路由联动（激活 tab → navigate）。
- 手动：多会话 tab 并行流式、SDK `floatSession` 收口到 tab、关闭 app 后 tab 恢复（可选持久化）。
