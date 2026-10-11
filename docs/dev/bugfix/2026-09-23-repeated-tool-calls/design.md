# 对话不停重复工具调用（game-engine 一期 / 二期范围调查）

- 日期：2026-09-23
- 状态：调查完成，未修复（用户明确先不修）
- 范围：game-engine 一期（R1.1/R2.1/R2.2/R2.5a/R3.2/R4.x/R7）与二期（R1.3/R1.4/R2.5b/R6.x/B1/B2/B3）触及的 turn 循环与 trigger 链路
- 影响文件（候选）：`packages/core/src/session/agent-runner.ts`、`packages/core/src/trigger/executor.ts`、`packages/core/src/trigger/trigger-manager.ts`、`packages/core/src/capabilities/rollback/tools.ts`、`packages/core/src/tools/emit-trigger-event.ts`、上游 `node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js`

## 现象

对话运行时工具调用不停重复、不收敛。按粒度分两类：

- **A 类（turn 内循环）**：同一个 turn 里模型反复调用同一（组）工具，每次收到 error 文本后微调参数再试，永不输出文本收尾。
- **B 类（跨 turn 循环）**：turn 正常结束，但新 turn 被不断触发（trigger 日志周期性出现 `trigger_completed`，或同一会话反复开新 turn），对话永远“还有下一轮”。

## 根因（已实证三条，均为“无计数器”类缺失）

### 1. 单 turn 内工具循环：基线即无防线（A 类主因）

`agent-loop.js:85` 的内循环是裸 `while (true)`，唯一出口是 `hasMoreToolCalls == false`（模型不再调工具，见 `:141-168`）。工具错误只变成 `toolResult` 错误文本回灌（`executeToolCallsSequential`，`:296-320`；截断场景见 `failToolCallsFromTruncatedMessage`，甚至**明示模型 re-issue**）。

Spherse 侧零补充（全仓 grep `maxIteration/toolCallLimit/重复检测` 零命中）：

- `AgentRunner` 只有一个 `inFlight` 布尔互斥（`agent-runner.ts:37,324`），防并发不防重复。
- 未提供 pi 层的 `shouldStopAfterTurn` / `getFollowUpMessages` / `getSteeringMessages`（grep 零命中），外层循环正常退出，不涉事。

结论：只要模型“见错就重试”，且错误是系统性的，循环永不停止。一期放大的错误面：

- R1.1 嵌套校验（`validate.ts`）：深路径错误、必填嵌套缺失、未知字段拒收——manifest 稍难即陷入“写→报错→微调→报错”。
- 所有工具错误都是“可重试文本”形状，没有一种错误告诉模型“别再试了”。

### 2. `rollback_turn` turnSeq 靠猜（二期新增，A 类高危）

`rollback_turn` 参数只有 `{turnSeq}`（`capabilities/rollback/tools.ts`），而 agent **没有任何途径发现合法 turnSeq**（session 消息无 seq，`_messageId` 是 run 级）。未知 turn 返回 `"No recorded side effects…"` 文本——模型视角与 validation error 无异，会逐个试 12、11、10……。是“猜数字”式循环的高危形态。

### 3. 跨 turn 循环：guard 齐全，但有个新鲜链重置大洞（B 类主因候选）

已核实的 guard（均有效）：`MAX_TRIGGER_DEPTH = 5`（`executor.ts:10`）、同 chain 内同 trigger 去重（`chainFiredTriggers` + 1024 LRU）、`inProgress` 并发互斥、per-session 排队 + T7 busy-defer（defer 保留原 chainId/depth，`executor.ts:73-97`）。

大洞：**新鲜链重置**。`onUserEvent`（`server/src/bus/ws-bus.ts:108`，即 `emit_trigger_event` 工具与外部 bus）、scheduler tick（`trigger-manager.ts:48`）、`runNow` 的 `fire()` 都不带 opts → **每次都是 depth 0 + 全新 chainId**。模型每轮调用一次 `emit_trigger_event`（同名事件）→ depth 永不增长、去重永不命中 → 无限 turn。R2.x 把 event trigger 做成一等公民（表单下拉、sp: 订阅）却没动这条路径。

T7 放大器（行为变更，需知晓）：同会话 `sp:` 订阅在 T7 前恒跳过（turn 内 busy），deferral 把它变成“恒转一圈后必触发一次 follow-up turn”。链 guard 能收住（chainId 透传已核实），但 turn 量翻倍；若复现恰好用了同会话订阅，T7 是放大器而非病因。

### 已排除

R1.3/R1.4（纯文档）、R6.1（UI 锁）、R6.3（复用 withdraw 通道）、B1/B2/B3（纯 renderer）、R2.5a（归因只读映射）、R3.2（被动订阅重读，不发消息）、R4.x（主题）、R7（只改 prompt 内容）、approval/ask（hang 不 loop）、retry（用户触发，自动重试已移除）、scheduler（10 分钟 tick + `isRunning` 互斥）。`ui-sdk/handlers/send-message.ts` 无去重（卡片 JS 若每次 load 都发送可自驱循环，但需卡片作者配合，属个案）。

## 定位方法（复现时对号入座）

1. 看 Streaming Log：**同一 turn 内**反复出现同名 tool_call → A 类；`trigger_completed` 周期性出现 / 会话来回切换 → B 类。
2. A 类看错误文本：validation / unknown-entry / “No recorded side effects”刷屏 → 对应工具的 manifest 或 turnSeq 问题。
3. B 类看 trigger 日志的 `depth` / `chainId`：depth 恒为 0/1 且 chainId 每次都不同 → 新鲜链洞（`emit_trigger_event` 循环）；depth 爬到 5 停 → guard 正常，是模型顶着 guard 反复开新链。

## 修复方向（未实施，供决策）

- P0（A 类治本）：turn 级工具调用计数上限（如同名连续 N 次即 abort turn 并报 reason），或重复调用检测（同名+同参连续出现即停）。位置在 runner 侧（`beforeToolCall` 已有钩子位）或 pi 层配置。
- P0（`rollback_turn`）：给 agent 可发现的 turn 标识（如结果里回显有效 turn 列表），消灭猜数字。
- P1（B 类）：`emit_trigger_event` 携带调用方链上下文（depth/chainId 透传），或加 per-trigger 频率限制；sp: 订阅文档注明 defer 行为变化。
- 诊断先行：以上全是静态推导。动手前先拿一次真实复现的 Streaming Log + trigger 日志对号入座，确认是 A 还是 B 再定修哪边。

## trigger / prompt 注入特性的牵连分析（2026-09-23 补充）

trigger 相关**直接涉案**，prompt 注入相关**基本不涉案**（worldbook 一条弱关联）。

| 特性 | 结论 |
|---|---|
| R2.1 三个 `sp:` 事件 | B 类燃料管道：每 turn 多出 3 个点火机会 |
| R2.2/R2.3 sp: 订阅放行 + 表单下拉 | 循环的“面”被实质扩大（以前建都建不了） |
| R2.4 depth/chain | 纯 mitigator，无辜 |
| T7 deferral | 行为变更：同会话 `sp:` 订阅从恒跳过变恒转一圈必触发；链 guard 能收住但 turn 量翻倍 |
| T7 synthetic error turn-end | **新增点火源**：失败 turn 以前无 turn-end，现在 `reason:error` 也会点燃 `sp:turn-end` 订阅者；失败风暴下 turn 量滚雪球（同链/depth 可收） |
| scheduler / `runNow` / bus | 新鲜链，与 R2.x 无关，未被改动 |
| R7.1 worldbook | 弱关联：每轮 projector 注入随对话变化的内容 + 占 token，最多让已在循环中的模型更糊涂；有 8 条/2k token 双预算 + 自反馈剥离 |
| R7.2 / skill catalog / memory / time / R4 / prompt 模板 | 静态内容，无辜 |
| B1 inline HTML | 只改渲染，`message.content` 不动，模型所见无变化，无辜 |

反方向（循环对特性的伤害，非病因）：trigger 日志刷屏；worldbook 每轮空转扫描；loop turn 的 data/card 写入越积越多，后续 `rollback_turn` 的 ref 链越长；事件日志膨胀拖慢 restore。

## 订阅运转机制（端到端）

一次订阅从事件到新 turn 的完整链路（行号为 2026-09-23 实测）：

**1. 事件入口（三条，互不相通）**

- 用户/外部事件 → `TriggerManager.onUserEvent`（`trigger-manager.ts:74`）：`sp:` 开头直接拒收（纵深防御），其余进匹配。调用方：`emit_trigger_event` 工具、server bus（`ws-bus.ts:108`）。
- 回合事件 → `TriggerManager.onInternalEvent`（`:79`）：非 `sp:` 拒绝；`sp:` 事件带 `{depth, chainId}` 透传。唯一上游是 factory 接线（`factory.ts:113-115`）：runner 的 `onTurnEvent` 回调。三个回合事件发射点：`sp:user-message`（`agent-runner.ts:199`，turn/start 落库后）、`sp:assistant-message`（`appendMessageEvent`，`message_end` 时，流式中即 turn 中期）、`sp:turn-end`（`persistMiddleware` 的 `agent_end` 处 `:505`，外加 T7 早失败 synthetic）。
- 时间 tick → `TriggerScheduler.onTimeTick`（`trigger-manager.ts:44-48`）：10 分钟对齐轮询，到期且该 trigger 不在跑才 `fire`。

**2. 匹配（`fireMatching :90-111`）**

遍历全 agent 的 event 型、enabled、有 eventName 的 trigger，**eventName 精确相等**才中；同 trigger 已在跑（`inProgress`）跳过。返回命中数。注意：匹配只看名字，不看 session——目标会话由 trigger 自身的 `mode` 决定。

**3. 执行（`executor.fire :63-244`）**

1. 深度守卫：`depth >= 5` 直接记 failed（`:83-95`）；同 chain 内已 fire 过该 trigger 直接跳过（`:98-111`）。
2. 会话落地（三种 mode，`:123-159`）：`new_session` 新建；`existing_session` 校验存在 + restore；`reusable_session` 有绑定复用否则新建并回写绑定。
3. 模板渲染消息（`resolveTemplateVars :164`），进 **per-session 串行队列**（`:169-175`，同 session 并发 fire 在此排队），`sendMessage`（`:189`，带 `{source:"triggered", triggerName, triggerDepth: depth+1, triggerChainId: chainId}`——**depth 在这里 +1，chain 原样透传**）。
4. `agent_end` 判定 turn 成败（`readTurnError :24-40`），成功/失败分别记日志 + 广播 `trigger_completed` / `trigger_failed`。
5. 异常出口（`:217-236`）：`turn in progress` 的 `ValidationError` 走 busy 分支，其余记失败。

**4. 回流（闭环处）**

新 turn 跑起来后，它的 `sp:` 事件再次进入步骤 1 的第二条入口，`depth` 已 +1、`chainId` 不变——于是同链去重与 depth 上限能掐断 ping-pong（A→B→A 在第 6 跳被 depth 拦下，同 trigger 重入被 chainSeen 拦下）。

**5. busy 路径（T7 新增）**

`sendMessage` 撞 `inFlight` → 首轮存入该 session 的 deferred 队列（上限 20，超了丢 oldest + warn + failed 日志），记一条 “deferred until turn end” 的 failed-terminal 日志；该 session 的下一个 `sp:turn-end` 到达 `onInternalEvent` 时先 `drainDeferred` 再正常匹配，重放时 `deferredAttempts + 1`，再忙则按 skip 处理（不再存）。

**6. 护栏总览与缺口**

| 护栏 | 位置 | 拦什么 |
|---|---|---|
| depth ≤ 5 | `executor.ts:83` | 跨 trigger 乒乓（A→B→A…） |
| 同 chain 同 trigger 去重 | `:98-111` + LRU 1024 | 同链重复点火 |
| `inProgress` | `:97,112` | 同 trigger 并发重入 |
| per-session 串行队列 | `:169-175` + manager restore memo | 同 session 并发 fire 双初始化 |
| defer 重放一次 | drain + `deferredAttempts` | 同会话订阅可用性（顺带把 skip 变 guaranteed turn） |
| **缺口：新鲜链重置** | `onUserEvent` / scheduler / `runNow` 调 `fire` 不带 opts | 每次 depth 0 + 新 chainId，depth 与去重永不生效——模型每轮 `emit_trigger_event` 同名事件即无限 turn |

## 修复方案（2026-09-26 定稿：A 类 + B 类）

### A：turn 级工具调用上限（主机制 `shouldStopAfterTurn`，`beforeToolCall` 只计数+兜底）

`{ block: true, terminate: true }` 不可靠：`shouldTerminateToolBatch`（pi `agent-loop.js:384-386`）要求同批**每个** result 都 `terminate === true`，多 toolCall 一批里有一个未 block 就停不下来，且 block 回灌的 error 文本模型可能照样重试。

- `agent-runner.ts` 现有 `beforeToolCall`（attribution 钩子位）上叠加计数：每 turn `toolCallCount`，同名 + 同参（规范化 stringify）连续计数；`turn/start` 清零。阈值放 `agent-runner.ts` 顶部常量：`MAX_TOOL_CALLS_PER_TURN = 30`、`MAX_SAME_TOOLCALL_REPEAT = 3`、`MAX_CONSECUTIVE_TRUNCATED_TURNS = 3`（与连 3 对齐；每次 `length` 都是整窗调用，3 连击即判卡死）。`retry` 开新 run，计数重置（显式用户操作才续跑，不算无限循环；且 P0-3 压缩可能已在两次之间缩小上下文）；
- 终止靠 `agent.shouldStopAfterTurn`（pi 可变属性，每次内层迭代后检查，可中途停）：超限返回 true → `agent_end` 干净退出；终止原因（`tool-call-budget` / `tool-call-repeat` / `truncated-loop`）写日志 + tool result 文本，不动 `turn/end` 枚举；
- 计数覆盖截断 fail 路径：在 `shouldStopAfterTurn` 内按 `lastCompletedTurn.toolResults` 累加并统计 `message.stopReason === "length"` 连击（该路径不经过 `beforeToolCall`，只在那边计数会漏）；
- `beforeToolCall` 的 block 仅作兜底（超限后 error 文本告知模型）。

### A：`rollback_turn` 可发现 turnSeq

- `refs.length === 0` 时列出本会话**有 side effect 的** `turn/start` seq（`session-manager` 抽 `listTurnSeqsWithSideEffects`，复用 `listSideEffectsByTurn` 的 turn 边界逻辑，按 `refs > 0` 过滤，否则混入无写入 turn）；
- 错误文案带 `known turnSeqs: 12, 24, 36`，不再只说 No recorded side effects。

### B：`emit_trigger_event` 透传调用方链

- `AgentRunner` 暴露 `getTriggerChain(): { depth, chainId }`（现状已有 `turnDepth` / `turnChainId` 字段）；
- `SessionPort` 加 `getTriggerChain(sessionId)`（`SessionManager` 转调；会话不存在返回 undefined → 新链）；
- `onUserEvent` 签名改为 `(eventName, payload, source?: { sessionId?: string })`，由 manager 内部经 `SessionPort.getTriggerChain` 取 opts 后 `fireMatching(..., opts)`，emit 工具不直接依赖 port；
- **ws-bus / scheduler / `runNow` 不传 source**，仍为新链；
- 同 chain 同 trigger 走现有去重，depth 走现有 ≤ 5。

测试：runner 侧第 31 次 tool / 连续 3 次同参 / length 连击 → `shouldStopAfterTurn` 停 turn 且 `agent_end`；rollback 未知 seq → 文案含已知列表（无写入 turn 不在列）；emit-trigger + trigger-manager：同一 session 第二次同名 emit 且 chain 相同 → 不新 fire，无 session 链（模拟 bus）→ 仍 fire。

验证：`npm test --workspace=packages/core`。

