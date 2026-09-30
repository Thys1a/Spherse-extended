# Compaction 机制与问题调研

调研时间：2026-09-29

范围：`@spherse/core` 上下文压缩全链路（规划 → 摘要 → 落库 → 重放）、压缩方法、
“发消息—压缩—回复截停—发‘继续’答非所问”的成因、与 opencode 实现的差异、
手动压缩入口与预检压缩的可行性。只调研，不含实现。

## 1. 代码位置

| 位置 | 职责 |
|---|---|
| `packages/core/src/context/compaction.ts` | 纯函数：`planCompaction`（96）、`generateDigest`（42）、`wrapDigestContent`（69）、`sanitizeDigestContent`（194）、`isDegenerateDigest`（198）、`sanitizeToolCallPairs`（202） |
| `packages/core/src/context/token-estimate.ts` | `estimateTokens` 启发式估算、`readCurrentTokens`（85：优先末条 `usage.totalTokens`，否则估算） |
| `packages/core/src/context/truncated-turn.ts` | `isTruncatedTurn`（10）、`markTruncated`（21）、`readUsageTotal` |
| `packages/core/src/capabilities/compaction/index.ts` | capability 装配，`afterTurn`（9）+ per-session `observedWindow` 闭包 |
| `packages/core/src/capabilities/compaction/transform.ts` | `maybeCompactLog`（28）：唯一触发编排 |
| `packages/core/src/capabilities/compaction/summarize.ts` | `summarizeForCompaction`（44）、预算（12）、指令（18）、60s 超时（6） |
| `packages/core/src/session/events.ts` | `compaction/applied{anchorSeq,digestContent,excludedSeqs,digestSource}`（41） |
| `packages/core/src/session/fold.ts` | `deriveMessageEntries`（50）：压缩投影，头部合成 digest（56），跳过 `≤anchorSeq`/excluded/abandoned（69） |
| `packages/core/src/session/agent-runner.ts` | `applyAfterTurnHooks`（555）、`persistMiddleware`（600）、`sendMessage`（183）、`retryLastTurn`（286）、`withdrawLastTurn`（359） |
| `packages/core/src/session/session-manager.ts` | `sendMessage`（117）/`retryLastTurn`（134）/`withdrawLastTurn`（143），无 compact 方法 |
| `packages/core/src/factory.ts` | `defaultCapabilities` 装配 `compactionCapability`（52） |
| `packages/contracts/src/websocket.ts` | replay 含 `compaction/applied`（135）；client 消息只有 `retry`/`withdraw`（339），无 compact |
| `packages/server/src/chat/ws-chat.ts` + `chat/chat-channel.ts` | `retry`/`withdraw` 透传（109/125），无 compact 通道 |
| `packages/app` | `runtime/outbound-actions.ts` 只有 `withdrawLastTurn`（122）；`lib/slash-menu.ts` 的 `TOKEN_RE`（21）只认 `/skill|command:` 与 `>>` |

权威文档：`docs/official/architecture/core.md`（会话运行时 §60-64）、
`docs/official/data-conventions.md`（160/166/192）、
`docs/dev/bugfix/2026-09-21-empty-turn-on-context-overflow/design.md`、
`docs/dev/backlog.md:27`（手动入口缺失已立项）。

## 2. 目前机制

触发只有一条路：`AgentRunner.applyAfterTurnHooks` → `compactionCapability.afterTurn` →
`maybeCompactLog`。即**每轮结束后事后压**，发送前无预检，`core/server/app` 均无手动入口。

`maybeCompactLog`（`transform.ts:28`）流程：

1. `deriveMessageEntries` 取 fold 视图，`readCurrentTokens` 算账；`contextWindow =
   model.contextWindow ?? 32768`，叠加 `observedWindow`。
2. 动态窗口学习：末条为截停轮（`stopReason/rawStopReason==length` 且无正文/toolCall）
   时，`window = min(配置, lastUsage×0.9)` 并记忆（53）；`overflowed` 时强制
   `thresholdRatio:0, hardRatio:0`（58），`postEstimate>0.5w` 再按 `keep=1/maxTurns=1` 重压（80）。
3. `planCompaction` 默认 `threshold 0.75 / hard 0.9 / target 0.5 / keep 20 prompts /
   max 40 turns`（`compaction.ts:100`）：`<0.75w` 不压；短会话且未过硬线不压（119）；
   过硬线按 `tail≤0.5w` 反推 keep，兜底 `keep=1`（123）；常规取
   `max(promptSplit,turnSplit)`（140）。digest 自身不计 prompt。
4. 摘要双路（97）：LLM 成功 → `digestSource:llm`；失败且 `>0.9w` → 机械
   `generateDigest`（仅 `[user]/[assistant]+[called tool]`，丢 toolResult/thinking，单条
   500 字截断）；失败且 `≤0.9w` → 跳过本轮。
5. 落库 `compaction/applied`（114）：`anchorSeq` 来自 `projected[anchorIndex].seq`；
   `excludedSeqs` 为 tail 中被 `sanitizeToolCallPairs` 丢掉的 error/aborted 轮对应 seq。
   append-only，不改历史；`AgentRunner` 随后 `syncBufferFromLog`（771）。

重放（`fold.ts:50`）：头部合成一条 `user:<compaction-digest>`，跳过
`seq≤anchorSeq`、excluded、abandoned；多次压缩只保留最新。`withdrawLastTurn` 拒绝撤回
已被 digest 覆盖的末轮（`agent-runner.ts:374`）。旧 `messages/compactions` 表由
`legacy-migrate.ts:37` 转为同事件。

## 3. 压缩的方法（五步）

1. **算账**：`readCurrentTokens` 优先 provider 回报的 `usage.totalTokens`，否则
   `systemPrompt + messages` 字符启发式（CJK 1.5字/token、西文 4字/token）。
2. **定剪裁线**：`planCompaction` 按阈值与轮数定 `anchorIndex/tail`，硬线场景按
   `tail≤0.5w` 反推保留量。
3. **洗 tail**：`sanitizeToolCallPairs` 删 `error/aborted assistant` 及其孤儿
   `toolResult`，记 `excludedSeqs`，保证 tail 无悬空 tool 对。
4. **写摘要**：`summarizeForCompaction` 复用本会话 `streamFn+model`，请求前缀复刻
   `systemPrompt+tools+fold视图+instruction`（命中 prompt cache）；预算为
   `5% currentTokens clamp 1500~16000 ∩ model.maxTokens`；`<50字` 判 degenerate；
   `sanitizeDigestContent` 转义嵌套标签防注入。
5. **重启点持久化**：`append("compaction/applied")`，下轮上下文即 `[digest, ...tail]`。

## 4. “发—压—停—‘继续’答非所问”的成因

四个机制叠加（主次分先后）：

**主因1：`“继续”`走错恢复路径——新 turn 而非续写。**
截停轮落库时 `markTruncated` 把 `length+空正文` 改写为 `stopReason:error +
rawStopReason:length + errorMessage`（`agent-runner.ts:610`，`truncated-turn.ts:21`）。
正确恢复是 `retryLastTurn`：`turn/retried` 废弃失败 seq + `agent.continue()` 同轮续写
（`agent-runner.ts:319,345`）。但用户发的 `“继续”` 走 `sendMessage →
agent.prompt(全新 user/message)`，失败空回不被废弃，上下文变成
`[…userA, assistant:error(空+中文 errorMessage), user:“继续”]`。“继续”无所指，
模型按新指令自由发挥。

**主因2：压缩把“正在做的事”摘要化了。**
截停后 `afterTurn` 以 `overflowed=true` 强制压，输入包含刚失败的空回；`overHard`/
`keep=1` 收紧时，触发截停的那条用户消息极易落在 `anchor` 之上，正文只剩进 digest。
digest 预算仅 5%，指令还要求丢问候与原始工具输出，不保证保留精确的未完成步骤、
工具参数与文件路径；下一轮 `[digest, tail…, “继续”]` 按模糊摘要续写必然偏。
多次循环形成 digest-of-digest，漂移累积；机械兜底（丢 toolResult/thinking/args）更差。

**主因3：失败轮在 tail 里被“抹掉”，指代断裂。**
`sanitizeToolCallPairs` 丢掉所有 error/aborted 轮并记 `excludedSeqs`，`fold` 重放跳过
它们——压缩后 live buffer 里截停轮彻底消失，`“继续”` 悬空去续一个看似已终结的话题；
而摘要输入却包含该空回（`summarize.ts:64` 用全量 fold），零信息还占一个 turn 计数。

**次因4：无预检，“继续”这轮大概率再爆。**
`observedWindow` 是事后学习（`transform.ts:54`），`“继续”` 发送时仍按旧窗口装配，
常再次超真实窗口 → 再截停 → 再压，每轮叠一层有损摘要。

**边界**：有半截正文的 `length` 不满足 `isTruncatedTurn`（要求无 text 且无 toolCall），
不标 error、`turn/end: completed`，`retryLastTurn` 拒绝（要求 error，`agent-runner.ts:311`），
强制压也不触发，用户只能发 `“继续”`，模型按新 turn 接话同样偏。

## 5. 与 opencode 实现的差异

源码：`anomalyco/opencode` dev 分支
`packages/opencode/src/session/{compaction,overflow,processor}.ts`、`prompt.ts`。
opencode 不是“压缩了还不断”，而是**不让会爆的请求发出去**；即使流式中途发现要爆，
也是内部转压缩任务自动续跑：

1. **发前预检**：`prompt.ts:1164` 的 `runLoop`（`while(true)` 同轮循环）每次调 LLM 前查
   `compaction.isOverflow({tokens: lastFinished.tokens, model})`，超限则 `create` 压缩任务
   并 `continue`，超窗请求根本不发生。我们只有 `afterTurn` 事后压。
2. **流式中途爆不落盘**：`processor.ts` 的 `step-finish` 置 `needsCompaction`，
   `Stream.takeUntil` 掐断流并返回 `"compact"`；`halt()` 抓 `ContextOverflowError` 同样转
   压缩。`prompt.ts:1320` 接着建压缩任务循环，不产生残缺 assistant 消息。我们把 `length`
   空回落盘成 error 消息，用户先看到截停。
3. **真用量 + 输出缓冲**：`overflow.ts` 用 provider 回报 `tokens.total ≥ usable`，
   `usable = limit.input(或context) − reserved`，`reserved = min(20_000, maxOutputTokens)`，
   2 万 token 安全垫提前压。我们用字符估算 + `0.75/0.9 × 配置window`，配置值还可能错
   （自定义 provider 默认 131k）。
4. **压缩后自动续**：同 `runLoop` 内完成，`overflow` 场景回放爆掉前的用户消息，
   普通自动压缩发合成 `compaction_continue` 续行消息，无需用户打“继续”。我们压缩后即
   结束 turn，靠用户手发新 turn 续。
5. **质量**：tail 按 token 预算（默认 `usable×25%`，2k~15k）逐轮实测而非固定轮数；
   `completedCompactions` 隐藏已摘要区间防 digest 套 digest；`prune()` 先清旧工具输出
   做轻量 relief。

一句话：opencode 把“超窗”当循环内的可恢复信号（预检 + 流中断 + 任务续跑）；
我们把它当轮后的持久化失败（落盘 error + 用户自救）。截停与“继续”错乱是这个时序
选择的结果，不是压缩本身的必然代价。

## 6. 手动压缩入口与预检压缩的可行性

都能做，无架构重写。

**手动压缩**：复用 `planCompaction + summarizeForCompaction + append`，需补三层
（仿 `withdraw`/`retry` 现成模式）：`core` 在 `AgentRunner/SessionManager` 新增
`compactSession({force?})`（`force` 复用 `thresholdRatio:0,hardRatio:0` 强制分支，
加 `ensureNotBusy` + `ConflictError`，且必须复用 `index.ts:7` 的同一 `windowStore` 实例，
否则动态窗口学习丢失）；`server/contracts` 加 `{type:"compact"}` client 消息
（`websocket.ts:322` 旁，v2 未启用可直接改）+ `ws-chat.ts` 分支 + `chat-channel.ts`
透传，并定 live 侧 `compaction/applied` 广播策略（当前仅推进游标）；`app` 加按钮或
`/compact`（`slash-menu.ts:21` 的 `TOKEN_RE` 与 `Composer.tsx:184` 需另开本地命令分支，
不走 `core/slash.ts`）。语义幂等：`plan.shouldCompact=false` 即 no-op。

**预检压缩**：最佳位点已存在——`sendMessage:264`（`retry:325` 同理）已算
`pendingPromptEstimate`，在落库后开跑前插一次 `maybeCompactLog + syncBufferFromLog`
即可。唯一分层摩擦：`TurnHooks.beforeTurn(agent)`（`turn-hooks.ts:10`）签名无 `eventLog`，
要么改签名（影响所有 capability），要么 `AgentRunner` 显式调压缩（打破“Runner 零
import 具体能力”，需经 port 中转）。代价：发送延迟增加（摘要 60s 超时）、需防预检与
事后双压（预检压完事后 `plan` 自然为 false，天然收敛）、仍需 `postEstimate≤0.5w` 校验。
