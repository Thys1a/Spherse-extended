# 聊天主题串扰与历史分页后看不到最新消息调研

调研时间：2026-09-11

_CB：本仓库为 clone（无 fork），`start-dev.ps1` 为本地 debug 脚本，本次只新增本文档，未改动任何代码与脚本。_
_落盘位置说明：按 AGENTS.md「写」路由表，bugfix 分析/调研归 `docs/dev/{bugfix,investigation}/`；`docs/feature/` 在本仓库不存在，故不新建。_

## Bug 1：给某个聊天设主题，切换到另一个聊天也会被覆盖

### 现象（用户原话转述）

为某个聊天（agent 会话）设置主题后，切换到另一个聊天页面（对方是否设置主题均然），新页面被旧主题覆盖。

### 代码链路

- agent 主题唯一注入点：`packages/app/src/features/chat/index.tsx:65,105-106`，`Chat` 经 `useAgentTheme` 算出 `themeHref` 后在 `div[data-chat-root]` 内渲染 `<link rel="stylesheet" href={themeHref}>`。
- href 构造：`packages/app/src/features/chat/hooks/useAgentTheme.ts:41`，`client.getPreviewUrl('.spherse/agents/{slug}/theme.css', ts)`，只要 `client/agentId/slug` 存在即返回非空——**无主题的 agent 同样挂一个（大概率 404）的 `<link>`**。
- 项目主题是另一条链：`packages/app/src/layouts/ProjectScope.tsx` → `packages/app/src/hooks/useCustomTheme.ts`，`<link id="custom-theme-link">` 挂 `document.head`，404 时 `onerror` 自摘（`:19-21`）；agent 侧无此兜底。
- 作用域机制见 `docs/official/architecture/theming.md`「三级主题层叠」：优先级靠 DOM 顺序，隔离靠作者把规则嵌套在 `[data-chat-root] { ... }` 内。

### 根因（两层叠加）

1. **`<link>` 放在哪个 div 内都不产生作用域，样式表永远全局生效。** 所谓 agent 隔离完全依赖主题作者自觉嵌套 `[data-chat-root]`。凡出现以下任一写法即全局泄漏：`:root` 变量覆盖、`body` 选择器、裸 `[data-chat-messages]/[data-chat-bubble]`（缺 `[data-chat-root]` 祖先）、`::before/::after` 漏 `position`（backlog 已有 chat-root 伪元素条目即同类问题）。
2. **多 `Chat` 实例可同时挂载，各自的 agent `<link>` 同时生效。** `Chat` 的消费方不止主页面一个：
   - 主页面 `packages/app/src/pages/ChatPage.tsx:46-53`（`key={session.id}`，切换 session 会卸载旧实例）；
   - 浮窗 `packages/app/src/features/floating-chat/FloatingChatContainer.tsx:51-59`（portal 到 `document.body`，跨路由常驻，由 `FloatingChatManager` 控制）；
   - 嵌入面板 `packages/app/src/features/docked-chat/DockedChatManager.tsx:97-102`（portal 到 `document.body`，可多条目共存）。
   
   后两者渲染在 body 末尾，cascade 顺序天然赢过主页面。只要浮窗/嵌入面板里开着主题 A 的会话，主视图切到会话 B 时 A 的样式表仍在文档里 → 看起来就是“A 覆盖 B”。即使 B 自己也有主题，双表共存时赢家也只由 DOM 顺序决定，与用户意图无关。

单实例切换（无浮窗/无 dock）理论上是干净的：旧 `Chat` 卸载即摘掉旧 `<link>`。若用户在该条件下仍复现，则只剩“主题 CSS 自身含全局选择器 + 浏览器对已加载样式的残留/缓存竞态”一种可能，需按下面验证步骤先排除多实例。

### 验证步骤（按序）

1. 复现时打开 DevTools Elements，全局搜索 `link[href*="agents/"][href*="theme.css"]`，数个数：≥2 即多实例共存确诊；记录每个 href 的 slug 与其宿主容器（主视图 / `.floating-chat-portal` / `[data-docked-chat-panel]`）。
2. 关掉所有浮窗与 docked 面板后单实例切换 A→B，观察泄漏是否消失；再逐一加回浮窗/dock 看泄漏是否重现。
3. 检查致事主题 CSS 是否含 `:root`、`body`、未以 `[data-chat-root]` 开头的选择器（模板与 skill 约束见 theming.md「同步契约」节）。
4. 顺带确认无主题 agent 的 `<link>` 在 Network 面是否为 404（`useAgentTheme` 无 `onerror` 自摘，与 project 侧不对称）。

## 修复方案（2026-09-11 立项实施，不碰 server/core）

### Bug 1：按 session 注入隔离后的 `<style>`，不再用全局 `<link>`

1. `data-chat-root` 加 `data-chat-instance={sessionId}`。
2. `useAgentTheme` 改走已有 `client.getAgentTheme(agentId)` 拉 CSS 文本：空/404（该 API 非 ok 即返回 `""`）→ 不注入；fs-watch 改精确匹配 `agents/${slug}/theme.css`。
3. 注入前改写选择器：`:root`/`html`/`body` → `[data-chat-instance="{id}"]`，其余顶层选择器加该前缀；`@font-face`/`@keyframes`/`@import` 保持全局；`@media` 内递归处理。
4. 渲染 `<style data-agent-theme={sessionId}>`，随 `Chat` 卸载一起摘掉。主视图/浮窗/dock 各用自己的 instance 前缀，互不串扰。
5. 不做 Shadow DOM（会打到 portal / `data-*` 主题契约）。

### Bug 2：锚定恢复 + 回写贴底 + 游标取 min + 稳定 key

1. `useChatScroll`：load-more 改锚定恢复——fetch 前记 `scrollHeight`，渲染后 `scrollTop = 旧值 - (新scrollHeight - 旧scrollHeight)`，不再写回旧 `scrollTop`；卸载回写时贴底（`isAtBottom`）则存 `0`；重开恢复仅当 `saved < -100` 且在当前可滚范围内才恢复，否则贴底。
2. 游标：`loadMore`/对账/`refreshHistory` 写 `oldestLoadedId` 时与旧值取更老者（`resolvePageCursor`，空会话直接取新页）；`hasMore` 仅新页真正接上已加载区间时更新。
3. `MessageList`：`MessageItem` 改 `_messageId` 稳定 key（transient 用 `t-${index}` 兜底），顺手收 backlog 同名条目。

### 落地顺序与验证

| 步 | 改动 | 测试 |
|---|---|---|
| 1 | `useChatScroll` 锚定 + 回写/重开贴底 | `useChatScroll.test.ts` 扩纯函数用例 + `resolvePageCursor` 用例 |
| 2 | `oldestLoadedId` 取 min（runtime + store + refreshHistory） | `streaming-store.test.ts` 补游标回归测试 |
| 3 | `MessageList` 稳定 key | 现有列表测试 |
| 4 | `useAgentTheme` 拉文本 + 前缀 + `<style>`；`index.tsx` 挂 instance | 新建 hook 测试（空主题不注入、前缀、`@media`/`@font-face`、slug 精确匹配） |

`npm test --workspace=packages/app` + `lint` + `typecheck` + 受影响 chat E2E。

## Bug 2：上翻点“加载更多”后往下滚看不到最新消息，重开页面不行、重启应用行

### 现象（用户原话转述）

往上翻点“点击更多”能看到历史消息，但往下滚动看不到最新消息；关闭聊天页面重开依旧，只有重启应用恢复。

### 代码链路

- 按钮：`packages/app/src/features/chat/MessageList.tsx:106-117`（`hasMore` 门控）→ `packages/app/src/features/chat/index.tsx:131` → `streaming-store.loadMore`。
- 分页请求：`packages/app/src/features/chat/runtime/streaming-store.ts:478-500`，`client.getSessionMessagesPage(agentId, sessionId, { limit: 20, before: oldestLoadedId })`，`before` 为空时服务端取最新一页。
- 服务端：`packages/server/src/routes/sessions.ts:80-103` → `packages/core/src/project-manager.ts:181-221`（events 路径：`seq < before` 取尾 `limit` 条，页首遇孤儿 `toolResult` 向后扩展；legacy 路径：`packages/core/src/store/session.ts:394-464` 同语义）。cursor（`id`/`oldestId`）在两条路径下都是单调的，前端无需区分（见 `docs/official/architecture/chat.md` 分页节）。
- 合并：`packages/app/src/features/chat/model/chat-history.ts:23-62` `mergeHistoryMessages` 按 `_messageId` 去重后按 id 升序排，transient（乐观/`_error`）追加在尾。
- 初次对账：`packages/app/src/features/chat/runtime/chat-session-runtime.ts:100-158`，WS `onopen` 拉最新一页 → `mergeHistoryMessages` → 再把缓冲事件 reduce 进去。
- 滚动：`packages/app/src/features/chat/hooks/useChatScroll.ts` 全文件。容器 `flex-col-reverse`（`MessageList.tsx:87`），`scrollTop = 0` 为底部；三处 JS 介入：load-more 前后恢复 `scrollTop`（`:55-65,84-94`）、发消息贴底、首次挂载按 store 的 `scrollPosition` 恢复（`:71-82`），卸载时回写（`:106-112`）。
- 会话缓存：`streaming-store.ts:208-248,331-351,468-476`，`detach` 只减 `attachedCount` 不清消息/游标/滚动位，`disconnect`/5 分钟 TTL `cleanupExpired` 才清；`connect` 在 WS 仍 OPEN 时直接返回（`chat-session-runtime.ts:74`），不重跑对账。

### 根因分析（按可能性排序）

1. **主假设：滚动位置毒化 + 内存缓存使之跨页面存活（与“重开不行、重启行”完全吻合）。** `loadMore` 后 `useChatScroll` 把容器恢复到翻页前 `scrollTop`（负值，即远离底部）。此后 `scrollTopRef` 只在 scroll 事件与 `scrollToBottom` 时更新；若用户没精确滚回 `scrollTop = 0`（阈值 `-100px`，见 `isNearBottom`），卸载回写的 `scrollPosition` 就是一个 mid-history 负值。重开页面时 `restoredScrollRef` 分支（`:71-82`）读到 `saved < 0` 即恢复到半山腰而非贴底 → “最新消息明明在 store 里，但视口停在历史区”。store 常驻内存使毒化值在页面开关间存活，重启应用清 store 即恢复。对“往下滚也到不了底”的加剧因素：`MessageList.tsx:70` 用 `key={index}`，翻页 prepend 使全列表索引位移 → 全量 remount（backlog“MessageList 改用稳定 key”条目已登记此代价，含 HtmlCard iframe 重建与 `userTouched` 丢失），`scrollHeight` 跳变会让“恢复旧 scrollTop”错位，配合图片/iframe 异步定高，底部可达性进一步恶化。
2. **次假设：重连对账把 `oldestLoadedId` 回退，导致翻页游标倒退。** 对账（`chat-session-runtime.ts:112-120`）与 `refreshHistory`（`streaming-store.ts:502-524`）永远用最新一页覆盖 `hasMore/oldestLoadedId`，而 `messages` 是合并保留的。若在 `loadMore` 后发生过 WS 重连/对账，`oldestLoadedId` 从“已加载最老”倒退为“最新一页最老”，下一次 `loadMore` 会重拉已加载区间（去重后无新消息，原地打转），用户观感同样是“翻页后数据不对”。此项解释“翻页异常”，但不直接解释“看不到最新”（最新仍在数组里），故列次位。
3. **已排除/低概率：** 服务端分页丢数据——events/legacy 双路径均有页边界 toolResult 配对扩展与单调 cursor，且 `mergeHistoryMessages` 对重叠页去重；空页返回 `entries: [] + oldestId: null` 时客户端保持原数组（`merge(current, []) = current`），不会删最新。若后续要实锤，只需在复现态打印 `sessions[sessionId].messages.length` 与首尾 `_messageId`，数据在而视口不在即确诊滚动问题，反之才是数据问题。

### 验证步骤（按序）

1. 复现后先不重启，在控制台读 `useStreamingStore.getState().sessions[<id>]` 的 `messages.length`、首尾 `_messageId`、`hasMore/oldestLoadedId/loadingMore/scrollPosition`：数组含最新即数据无罪，锁定滚动。
2. 检查 Elements 中 `div[data-chat-messages]` 的 `scrollTop/scrollHeight/clientHeight`，手动置 `scrollTop = 0` 看最新是否出现；同步数 `link` 个数排除 Bug 1 串扰。
3. 复现“关闭重开仍坏”时对比重开前后的 `scrollPosition` 是否为同一负值；重启后该值清零即闭环。
4. 若要区分次假设：在 `loadMore` 后人为断网/重连一次，观察 `oldestLoadedId` 是否从旧值跳回新值。

### 修复方向（已立项实施，见文末“修复方案”节；以下为原调研记录）

- 滚动：卸载回写时若 `isAtBottom` 为真则存 `0`；重开恢复仅在用户确实离开过底部且目标消息仍存在时恢复，否则贴底；`MessageList` 改用 `_messageId` 稳定 key（backlog 已有条目，可合并）；load-more 恢复改用“锚定消息 + offsetTop 差值”代替“恢复旧 scrollTop”，抵抗 iframe/图片异步定高。
- 游标：对账/`refreshHistory` 不再无条件覆盖 `oldestLoadedId`——仅当返回页与已加载区间衔接（或已加载为空）时更新，否则保留更老游标并合并 `hasMore = hasMore || oldHasMore`；或把“已加载最老游标”与“最新页对账”拆成两个独立字段。
- 可观测性：给 `loadMore`/对账加 `messages.length + oldestLoadedId` 一行 debug 日志，方便下次直接定界。

## 影响面清单（两 bug 公共）

- `packages/app/src/features/chat/`：`index.tsx`、`MessageList.tsx`、`hooks/useAgentTheme.ts`、`hooks/useChatScroll.ts`、`hooks/useChatSession.ts`、`runtime/streaming-store.ts`、`runtime/chat-session-runtime.ts`、`model/chat-history.ts`
- `packages/app/src/features/floating-chat/`、`packages/app/src/features/docked-chat/`（多实例共存方）
- `packages/server/src/routes/sessions.ts`、`packages/core/src/project-manager.ts`、`packages/core/src/store/session.ts`（Bug 2 服务端分页语义，现状无改动需求，备查）
- 文档：`docs/official/architecture/theming.md`（若定多实例优先级语义）、`docs/official/architecture/chat.md`（若改游标/滚动契约）、`docs/dev/backlog.md`（两条修复立项）
