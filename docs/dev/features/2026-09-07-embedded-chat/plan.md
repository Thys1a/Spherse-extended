# [Feature] 实时聊天面板嵌入 HTML（一期：host 覆盖层 dock）— 实施计划

> **For agentic workers:** 适合 subagent-driven-development 模式逐 task 实现。Steps 用 checkbox 跟踪。每个 Task 结束后运行对应 workspace 的 build + test 验证。
> **本 feature 跨 sdk/app 且含高返工风险点（定位坐标系），建议先做 Task 0 定稿，再逐 task 实现。**

**Design doc:** `docs/dev/features/2026-09-07-embedded-chat/design.md`

**关键约定（实现时必须遵守）:**

- 一期**不建「聊天事件进 iframe」通道**，不实现 SDK 自绘 widget（二期）。
- 定位 = `iframe 元素在 outer 文档 rect` + `slot 在 iframe 文档内 rect` 两段合成；**外层聊天滚动需 host 侧重算**，不能只依赖 SDK 的 iframe 内 scroll 监听。
- `chat.rect` 加入 `RATE_LIMIT_WHITELIST`（不计数），SDK 侧自限 ~10/s。
- 每 iframe 仅 dock 第一个占位元素；「source window → dock 状态」用 map 维护；iframe 卸载/pagehide 清理。
- `DockedChatManager` 复用 `FloatingChatManager` 的 `session→agent` 解析与 session 消失清理逻辑。

---

### Task 0: 定位坐标系定稿（伪代码/时序，阻塞 Task 2/3）

- [x] **Step 1**: 写定位合成 + 滚动重算伪代码/时序图（viewport = iframeElement.getBoundingClientRect() + slotRect；外层滚动/ResizeObserver 触发重算；节流策略）。
- [x] **Step 2**: 与用户确认 dock 容器挂载位置（`document.body` 绝对定位 + 双向同步 vs 跟随 iframe 元素的稳定容器）后再进入 Task 2/3。

### Task 1: SDK 侧（`packages/sdk`）

**Files:**
- Modify: `packages/sdk/src/runtime/actions.ts`（`dockChat` fire action）
- Add: 占位扫描 + rect 上报模块（ResizeObserver + iframe scroll 监听 rAF ~150ms 节流）
- Modify: 订阅生命周期（pagehide/元素移除 → `chat.undock`）
- Add: SDK 单测

- [x] **Step 1: `dockChat({ sessionId? })`**：fire `chat.dock`；扫描 `<spherse-chat>` / `[data-spherse-chat]`，默认绑 `runtime.sessionId`；sessionId 缺省时支持 `createSession({agentSlug, open:false})` 后 dock。
- [x] **Step 2: rect 上报**：ResizeObserver + iframe scroll 监听（rAF 节流 ~150ms）fire `chat.rect { x,y,w,h }`（iframe 文档坐标）；自限 ~10/s。
- [x] **Step 3: undock**：pagehide / 占位元素移除 fire `chat.undock`。
- [x] **Step 4: 单测**：占位扫描、rect 计算、dock/undock 生命周期 postMessage 序列。
- [x] **Step 5: 验证**：`npm run build --workspace=packages/sdk`；`npm test --workspace=packages/sdk`（若 sdk 无测试则 `npm run build`）。

### Task 2: host handler + rate limit（`packages/app/src/ui-sdk/`）

**Files:**
- Add: `packages/app/src/ui-sdk/handlers/chat-dock.ts`（注册 chat.dock / chat.rect / chat.undock）
- Modify: `packages/app/src/ui-sdk/rate-limit.ts`（白名单加 `chat.rect`，`chat.dock/undock` 计数）
- Modify: `packages/app/src/ui-sdk/index.ts`（barrel import）
- Add: handler 单测

- [x] **Step 1: `chat.dock` handler**：校验 sessionId 属当前 project；rect 数值化 clamp 到 iframe 可视区；`event.source` → iframe 元素映射。
- [x] **Step 2: `chat.rect` / `chat.undock`**：更新/清除 dock 状态（source→dock map）。
- [x] **Step 3: rate-limit**：`RATE_LIMIT_WHITELIST` 加 `chat.rect`。
- [x] **Step 4: 单测**：registry、非法 rect clamp、非本 project sessionId 拒绝、白名单行为。
- [x] **Step 5: 验证**：`npm run build --workspace=packages/app`；`npm test --workspace=packages/app`。

### Task 3: DockedChatManager（渲染 + 生命周期）

**Files:**
- Add: `packages/app/src/features/docked-chat/DockedChatManager.tsx`（或并入 ui-sdk 桥层）
- Modify: `packages/app/src/lib/feature-registry.ts`（`embedded-chat` ALL_HOSTS）
- Add: 组件测试

- [x] **Step 1: DockedChatManager**：复用 FloatingChatManager 的 `session→agent` 解析（useProjectCatalog/useProjectSession）；createPortal 渲染 `<Chat hideHeader>`；按 Task 0 坐标定位。
- [x] **Step 2: 生命周期清理**：session 消失 / project close → undock；iframe 卸载（HtmlCard 折叠/去重折叠）→ 清理。
- [x] **Step 3: feature gate**：`embedded-chat`（ALL_HOSTS）；入口按 host 条件渲染。
- [x] **Step 4: 组件测试**：渲染 `<Chat>` 且 streaming store attach 计数 +1；session 消失触发清理。
- [x] **Step 5: 验证**：`npm run build --workspace=packages/app`；`npm test --workspace=packages/app`。

### Task 4: 文档 + E2E

**Files:**
- Modify: `packages/presets/skills/spherse-use-ui-sdk/SKILL.md`（`dockChat` API 节）
- Modify: `docs/official/architecture/ui-sdk.md`（机制节）
- Add: E2E spec（`packages/app/e2e/`）

- [x] **Step 1: SDK 文档**：SKILL.md 加 `dockChat`/占位元素/rect 说明（面向 LLM 权威手册）；ui-sdk.md 补 `chat.dock/rect/undock` 与 DockedChatManager 机制。
- [x] **Step 2: E2E**：agent 产出带 `<spherse-chat>` 的 HTML 卡片 → 面板出现 → 发消息 → 流式回包全链路。
- [x] **Step 3: presets 同步构建**（改 SKILL.md 后）：`npm run build --workspace=packages/presets`。
- [x] **Step 4: 验证**：`npm run build --workspace=packages/presets`；`npm run verify`；`npm run verify:e2e`（按影响面选 e2e spec）。

---

## Task 依赖与并行性

```
Task 0 (坐标定稿) ──► Task 1 (SDK) ──► Task 2 (handler) ──► Task 3 (DockedChatManager) ──► Task 4 (文档+E2E)
```

Task 1（SDK 上报）与 Task 2（handler 收）可并行开发但需 Task 0 定稿 rect 语义对齐。Task 3 依赖 Task 2 的 dock 状态。

## 全局验证

```bash
npm run build
npm run verify
npm run verify:e2e    # 合并/发布前
```

可选（桌面实测）：`npm run dev` 打开含 `<spherse-chat>` 占位元素的 HtmlCard，验证定位跟随外层滚动、卡片折叠清理、float 同 session 共存。

## 实施偏差记录

- E2E spec 实际位于 packages/desktop/e2e/ui-sdk-dock-chat.spec.ts（唯一 E2E 位置，本计划 Task 4 所写 packages/app/e2e/ 有误）
- Task 3 Step 4 的「streaming store attach 计数 +1」断言未在 DockedChatManager 测试中实现（attach 逻辑由 streaming-store.test.ts 独立覆盖，manager 测试 mock 了 Chat）
- rect 上报节流口径为 leading-edge 时间节流 ~100ms（非 rAF ~150ms）
- 审查反馈修复：dockChat 收敛为 call 型（错误码 reject 生效）、chat.dock 入 rate-limit 白名单、同 source 同 session 重复 dock 保留 slotRect（防重载闪断）、四边 clamp、host 侧 slotRect 同值短路
