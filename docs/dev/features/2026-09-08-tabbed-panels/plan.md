# Plan：标签页式窗口（架构 B：并行保活）

对应 design：同目录 `design.md`。

决策：架构 B（并行保活）；持久化 localStorage；默认 tab + 右键浮窗；`tabs` 为静态 feature（ALL_HOSTS）。

## 任务

1. **tab-store**（`packages/app/src/features/tabs/tab-store.ts`，zustand）→ verify: 单测
   - `byProject: Record<projectId, { tabs: Tab[]; activeTabId: string | null }>`
   - `Tab = { id; kind: "chat"|"content"|"browser"|"home"; projectId; label; sessionId?; filePath?; url? }`
   - `openTab` 按 sessionId/filePath/url 复用或新建；`closeTab`/`activate`/`reorder`/`clearProject`
   - localStorage 持久化（key `spherse:tabs`）
2. **TabStrip + TabContainer**（`features/tabs/`）→ verify: 组件测试
   - TabStrip：渲染当前 project tabs、激活/关闭/拖拽排序
   - TabContainer：按 kind 独立渲染 `Chat` / `ContentBrowser` / `BrowserPageView` / `WelcomePage`，active 控 `display:none`
3. **ProjectScope 改造** → verify: 手动（进入 project、切 project）
   - `main` 内 `<Outlet/>` 换 `<TabStrip/> + <TabContainer/>`（`useFeature("tabs")` 关时回退 `<Outlet/>`）
   - 进入 project 无 tab 时建 home tab；`setProjectLastRoute` 改由 activeTab 投影替代
   - `router.tsx` 子路由 element 置空占位（保留 URL 结构供深链匹配）
4. **路由投影双向同步**（核心难点）→ verify: 组件测试 + 手动（浏览器后退、深链）
   - activeTab → `navigate(route, { replace: true })`；`location` 变化 → `openTab`/`activate`
   - ref 标记 store 驱动的 navigate 以防循环；现有 `navigate(...)` 调用点不动
5. **SDK handler 拦截** → verify: 现有 handler 单测更新 + 手动
   - `openChat`/`openFile`/`floatContent`/`openSession`（含 floating-browser `openFloat`）：tabs 开且非显式 float → `openTab`
   - 显式 `float` → 原 floating 路径；右键「浮窗打开」复用现有项
6. **feature gate** → verify: typecheck
   - `feature-registry.ts` 加 `"tabs"`（ALL_HOSTS）
7. **i18n**（加载 i18n skill）→ verify: i18n check
   - tab 关闭/拖拽提示等文案
8. **手动验收** → verify: 逐项确认
   - 多 chat tab 并行流式、content 编辑态保留、browser iframe 不重载、右键浮窗、重启恢复

## 范围外

跨窗口拖出（detach）、跨 project tab 混排（tab 按 project 隔离）。

## 待定（实施时定）

- chat tab label：调用方先查 session title，还是进入后异步解析。
- 无 tab 时是否始终强制一个 home tab。
