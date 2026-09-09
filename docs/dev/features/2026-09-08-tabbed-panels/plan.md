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
   - 进入 project 无 tab 时由 location→store 同步按当前路由建 tab（index 建 home）；`setProjectLastRoute` 保留（投影 URL 天然喂给它）
   - `router.tsx` 未动（子路由保留匹配，gate 关时旧页照常渲染）
4. **路由投影双向同步**（核心难点）→ verify: 组件测试 + 手动（浏览器后退、深链）
   - activeTab → `navigate(route, { replace: true })`；`location` 变化 → `openTab`/`activate`
   - ref 标记 store 驱动的 navigate 以防循环；现有 `navigate(...)` 调用点不动
5. **SDK handler 拦截**（实为 navigate→sync 统一收口，仅三处补丁）→ verify: 现有 handler 单测全过 + 手动
   - 默认打开一律走原 `navigate` 调用（不动），由 location→store 同步转为 tab；显式 `float` 走原 floating 路径；右键「浮窗打开」复用现有项
   - `openChat` floating-guard 在 tabs 开时放行（同会话浮窗中时默认打开仍建 tab）；`handleSelectSession` 同理；`FloatingChatManager` 的路由 bounce 在 tabs 开时跳过
   - chat 标题由 TabStrip 按 sessionId 查 catalog 解析（重命名自动跟随），调用方无需传 label
6. **feature gate** → verify: typecheck
   - `feature-registry.ts` 加 `"tabs"`（ALL_HOSTS）
7. **i18n**（加载 i18n skill）→ verify: i18n check
   - tab 关闭/拖拽提示等文案
8. **手动验收** → verify: 逐项确认
   - 多 chat tab 并行流式、content 编辑态保留、browser iframe 不重载、右键浮窗、重启恢复

## 范围外

跨窗口拖出（detach）、跨 project tab 混排（tab 按 project 隔离）。

## 待定（已定）

- chat tab label：TabStrip 按 sessionId 查 catalog 解析标题（重命名自动跟随），openTab 的 label 仅作回退。
- 关最后一个 tab 时 store 自动回退到 home tab（project 恒有 ≥1 tab）。
