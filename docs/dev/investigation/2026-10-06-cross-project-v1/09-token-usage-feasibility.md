# Token 数据可行性调研：对话调用用量 + 输入框预计 token（拟定 v1.0.x）

调研时间：2026-10-10
问题：能否（A）展示「对话调用的 token 数据」（每轮/当前上下文用量），（B）展示「输入框预计 token」（输入时实时估算）？
结论：**两者均可行，且大部分是前端工作**；真实 provider `usage` 已被采集并落库，`sessionStatus` 接口也已存在。若采纳，拟定 **v1.0.x**。

## 一、结论

- **数据已就绪**：pi-ai 的 assistant message 强制携带 `Usage`（`input/output/cacheRead/cacheWrite/reasoning/totalTokens`，`node_modules/@earendil-works/pi-ai/dist/types.d.ts:265-329`），core 原样落库并额外打 `promptEstimate`（`session/agent-runner.ts:837-853`）。
- **接口已有**：`sessionStatus { currentTokens, contextWindowLimit }`（`contracts/src/sessions.ts:72-75`）+ `GET .../sessions/:id/status`（`server/src/routes/sessions.ts:127-139`）。
- **缺的是展示与刷新**：聊天界面没有用量指示，`sessionStatus` 只在会话列表弹窗按需取；正常轮次的 usage 在投影时被丢弃（仅 error 才保留）。
- **评估器不统一**：core 无 tokenizer，用 CJK 感知字符启发式（`context/token-estimate.ts:11-32`），app 想复用需从 core 导出。

## 二、现状（代码事实）

| 项 | 位置 | 说明 |
|---|---|---|
| 真实用量采集 | `session/agent-runner.ts:837-853` | 每个 assistant 消息带 `usage`；额外注入 `promptEstimate`（发送前估算） |
| 估算器 | `context/token-estimate.ts:11-32` | `estimateString = ceil(cjk/1.5 + 其他/4)`；`estimateTokens` `:64-73`；**未从 core 导出** |
| 当前用量读取 | `token-estimate.ts:85-91` `readCurrentTokens` | 有真实 usage 用其 `totalTokens`，否则估算 |
| 会话状态 | `session/status.ts:7-10,46-58` | `SessionStatus { currentTokens, contextWindowLimit }` |
| 发送前估算 | `agent-runner.ts:275-278,341-344,622-625,793-819` | `pendingPromptEstimate`；`maybePreCompact` 0.75×window |
| 接口/契约 | `contracts/src/sessions.ts:72-75`；`server/src/routes/sessions.ts:127-139`；`app/src/lib/api.ts:682-688` | `currentTokens` / `contextWindowLimit` |
| 前端诊断（已存在但仅在 error 展示） | `features/chat/model/chat-tool-projection.ts:40-103` | `_diagnostics` 仅在 `stopReason==="error"`/截断时赋值（`:96-101`） |
| 已有的用量 UI（隐藏） | `features/agent-session-list/SessionStatusDialog.tsx:56-77,102-133` | 会话列表右键进入，取状态并画用量条 |

## 三、目标 A：对话调用 / 上下文用量展示

**已有**：每轮 `promptEstimate`（发送前估算）+ 真实 `usage`；`sessionStatus` 接口；模型窗口来自 catalog（`contracts/src/settings.ts:3-12`）。

**缺**：① 聊天内无指示、`turn_end`/`agent_end` 无刷新触发；② 正常轮次 usage 被投影丢弃（`chat-tool-projection.ts:96-101` 的 error-only 门）；③ 指标口径不一（见 §五）。

**最省的落地**（前端为主）：
- **上下文用量 pill**：新增 `useProjectSessionStatus` 查询（复用现有 endpoint），挨着 `Composer.tsx` 的 `SessionModelPill` 渲染，`turn_end`/`agent_end` 触发失效重取；渲染逻辑可复用 `SessionStatusDialog`。→ 纯前端。
- **每轮 token 数**：放宽 `chat-tool-projection.ts:96-101` 的门，让正常轮次也带 `usage`/`promptEstimate` 到 entry model，在 `AssistantBubble` 展示。→ 改一个投影门 + 展示 + i18n + 测试。

## 四、目标 B：输入框预计 token

**现状**：`Composer.tsx` 无计数器；输入态 `input` 可直接 `useMemo` 估算。

**算法复用**：与 `estimateTokens` 同源（CJK 感知）。阻塞点：`estimateTokens` **未从 core 导出**（`core/src/index.ts` 无、`core/package.json:7-12` 仅 `"."`）。

**选项**：
1. 从 `core/src/index.ts` 导出 `estimateTokens`（或一个纯文本变体），app 直接引用——**一条导出，单一真相**，推荐。
2. 在 app 内复制那段 ~25 行启发式（`features/chat/lib/estimate-tokens.ts`）——不改跨包面但重复逻辑。
3. 引 `@earendil-works/pi-ai` 的 `estimateTextTokens`（chars/4）——对 CJK 更差、越包边界，不推荐。

**窗口分母（可选）**：catalog 模型带 `contextWindow`；有效模型按 `session.model ?? agent.model ?? 全局默认` 解析（同 `SessionModelPill.tsx:83-105`）。只显示 token 数则**无需任何接口**。

## 五、指标口径（须先定死）

- `sessionStatus.currentTokens` 基于 `usage.totalTokens`（**含输出**）且忽略最后一次 assistant 之后的尾消息；
- app 侧 `promptTokens = input + cacheRead`（**输入侧**，才是「上下文占用」的正确口径）。
- 若同时做「上下文 pill」与「输入框预计」，需**统一到输入侧占用**，否则两个数字会打架。

## 六、可行性判定

| 项 | 可行 | 成本 |
|---|---|---|
| A1 上下文用量 pill（聊天内） | 高 | 低（前端查询 + 小组件 + 失效触发） |
| A2 每轮 token 展示 | 高 | 低–中（改投影门 + 展示 + 测试） |
| A3 WS 实时推送状态 | 中 | 中（新事件管道；仅 A1 刷新不够时才做） |
| B1 输入框预计 token | 高 | 低（导出/复用 `estimateTokens` + `useMemo`） |
| B2 输入框 + 窗口占比 | 高 | 低–中（再加有效模型解析） |

**结论**：可行，建议先做 A1 + B1（纯前端 + 一条 core 导出），拟定 **v1.0.x**；A2 与 B2 顺带；A3 视需要。

## 七、范围与不做

- 本调研不修改 `docs/dev/backlog.md`、不新增 backlog 条目；不产出 design/plan；不改 `docs/official/`。
- 结论基于当前 `packages/core` / `packages/app` 代码，未做原型验证。
