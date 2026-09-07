# 实时聊天面板嵌入 HTML（一期：host 覆盖层 dock）

## 背景

用户要求「实时聊天面板嵌入 html，实现网页里聊天的效果」——agent 构建的 HTML 工作区（经 UI SDK / HtmlCard iframe 机制渲染）里能内嵌一个可对话的实时聊天块，而非只开放/浮窗/发送。

调研确认现状硬约束：

- iframe↔host 只有 postMessage action + `file:update` 事件（`packages/app/src/ui-sdk/event/subscription-registry.ts:20` 硬编码仅 `file:update`），**无聊天流式事件通道**。
- SDK 无渲染/挂载能力（thin-SDK 设计哲学，`window.spherse` 只有 open/float/sendMessage/data/只读 api）。
- 桌面 prod renderer 是 `file://`（`packages/desktop/electron/window.ts:26`），无 HTTP 可嵌入路由（堵死「iframe 套 SPA 路由」路线）。
- `Chat` 组件可复用（只吃 `sessionId` + `agent` props，已有 `hideHeader`），floating chat（`FloatingChatManager` → `FloatingChatContainer.tsx`）已证 body portal 二次挂载 + streaming store 引用计数可行。
- 现有「导出会话」是纯文本 `.txt` 下载（`features/agent-session-list/lib/export-session.ts`），非 HTML、不可嵌入。

方案比选结论（已与用户确认）：**一期采用 host 覆盖层 dock 方案**——复用真 Chat 树（全功能 parity：流式/重试/审批/卡片），外观跟 app 主题（页面 CSS 不可定制聊天块），基建最小。SDK 自绘 widget 留作二期按需立项。

## 一期设计：`dockChat` 覆盖层方案

### SDK 侧（`packages/sdk`）

新增 fire 型 action 与占位元素：

```
spherse.dockChat({ sessionId? }) → fire "chat.dock"
扫描 <spherse-chat> / [data-spherse-chat] 占位元素（默认绑 runtime.sessionId）
ResizeObserver + iframe scroll 监听（rAF 节流 ~150ms）→ fire "chat.rect" { x,y,w,h }
pagehide / 元素移除 → fire "chat.undock"
```

- **sessionId 获取**：聊天卡片内 `runtime.sessionId` 自动绑；独立工作区页面可 `const {sessionId} = await spherse.createSession({agentSlug, open:false})` 再 dock——复用现有 action，无新鉴权面。
- **占位元素**：`<spherse-chat session-id>`（属性绑定）或默认绑 runtime.sessionId。v1 每 iframe 只 dock 第一个占位元素，其余忽略。

### host 侧（`packages/app/src/ui-sdk/` + chat）

```
handlers/chat-dock.ts    # 注册 chat.dock / chat.rect / chat.undock
                        # 校验 sessionId 属当前 project；rect 数值化并 clamp 到 iframe 可视区
                        # event.source（iframe window）→ 定位对应 iframe 元素（同 event bridge 先例）
DockedChatManager.tsx    # 与 FloatingChatManager 同构：解析 session→agent + createPortal 渲染 <Chat hideHeader>
                        # 容器 position:absolute 定位（见下「定位坐标系」）
                        # 共享 streaming store（attach/detach 引用计数天然支持）
```

### 定位坐标系（本方案最易返工点，先定稿）

dock 面板最终要落在**外层文档 viewport** 的某个矩形，该矩形由两段合成：

```
viewport 位置 = iframe 元素在 outer 文档的 rect + slot 在 iframe 文档内的 rect
              └─ host 侧可知（iframe DOM 元素）      └─ SDK 上报（postMessage）
```

- SDK 侧 scroll 监听只覆盖 **iframe 内部滚动**，覆盖不了**外层聊天列表滚动**（HtmlCard 位于可滚动消息流里，iframe 元素随之移动）。
- 因此 host 侧需对 iframe 元素**另行同步**（对 iframe 元素挂 ResizeObserver + 监听外层滚动），或改为把 dock 容器挂在「跟随 iframe 元素定位」的稳定容器内，而非 `document.body` 绝对定位。开工前以伪代码/时序图确认坐标合成与滚动重算，再进实现。

### 生命周期与清理

- **agent 解析**：dock 面板渲染需 `session → agent`（同 `FloatingChatManager.tsx:17-18,39` 用 `useProjectCatalog`/`useProjectSession` 解析）。
- **session 消失 / 项目关闭**：session 被删或 project close 时 undock（同 `FloatingChatManager.tsx:25-29` 的清空逻辑）。
- **iframe 卸载**：HtmlCard 折叠 / 去重折叠（`computeSupersededToolCallIds`）会卸载 iframe → 以 `source` 窗口销毁 / pagehide 为信号清理对应 dock。
- **多 iframe 并存**：多卡片各自 dock 时需「source window → dock 状态」的 map（`event.source` 已在 `ActionContext` 可用，`use-spherse-message-listener.ts:41`）。

### 其它

- **z 序与遮挡**：覆盖层在 iframe 之上，rect 准确时视觉即「嵌入」；z-index 需与 floating-frame 层协调，避免被消息流/浮窗盖住。页面元素浮在占位元素上方时会遮住聊天（v1 接受，文档写明占位元素勿被覆盖）。
- **rate limit 特例**：`chat.rect` 高频滚动会打爆 30/60s 全局配额（`checkRateLimit` 对 fire/call 一律生效，`use-spherse-message-listener.ts:36`）→ 将 `chat.dock/undock` 计数、`chat.rect` 加入 `RATE_LIMIT_WHITELIST`（`rate-limit.ts:5`）不计数，SDK 侧再自限 ~10/s 上限作为对无上限的唯一防线。
- **多实例共存**：用户同时 float 同一 session 时，两个 Chat 实例共享 streaming store，attach 引用计数处理，无冲突。
- **feature gate**：`embedded-chat` feature，electron+web 双开（与 floating 不同，无窗口拖动依赖）；web 壳同样走此 renderer，理论直接可用。

### 文档同步

- `packages/presets/skills/spherse-use-ui-sdk/SKILL.md` 加 `dockChat` API 节（面向 LLM 的权威手册）。
- `docs/official/architecture/ui-sdk.md` 机制节补 `chat.dock/rect/undock` 与 DockedChatManager。

## 二期（可选）：SDK 内静态聊天 widget

面向「分发」场景：`spherse.chat.render(el, {sessionId})` 拉历史（现有 `api.call sessions.messages` 白名单 op）+ 自绘轻量气泡 + `sendMessage` 发送。无流式（轮询或事件通道扩展 `chat:turn` 类型）。**只有一期验证真实需求后再立项**——避免先建「聊天事件进 iframe」大基建却无人用。

## 已知取舍

- 聊天块外观跟 app 主题（页面 CSS 不可定制）——已与用户确认接受，换取全功能 parity 与最小基建。
- 页面元素遮挡占位元素上方会盖住聊天（v1 接受）。
- 每 iframe 仅一个 dock 位（v1）。
- 一期不建「聊天事件进 iframe」通道，因此页面 CSS 无法定制、也无法脱离 app 独立分发聊天块（二期 widget 才能覆盖该场景）。

## 验证

- SDK 单测：占位扫描、rect 计算、dock/undock 生命周期 postMessage 序列。
- host handler 单测：registry、非法 rect clamp、非本 project sessionId 拒绝。
- 组件测试：DockedChatManager 渲染 `<Chat>` 且 store attach 计数 +1。
- E2E（高价值）：agent 产出带 `<spherse-chat>` 的 HTML 卡片 → 面板出现 → 发消息 → 流式回包全链路。
- i18n 三语（如有文案）+ `npm run check:i18n`；lint、typecheck、相关 workspace 单测。

## 规模

一期 ~1200-1800 行含测试；建议单独立项走完整 design doc → review 流程。
