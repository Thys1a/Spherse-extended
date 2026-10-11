# 压缩截停与“继续”错乱：解决方案

时间：2026-09-29
前置调研：`./README.md`（机制、成因、opencode 差异、可行性）
前置设计：`docs/dev/bugfix/2026-09-21-empty-turn-on-context-overflow/design.md`
状态：方案待定，未实施。

> 实施注记（2026-09-30，分支 `feat/truncation-auto-retry-54673e`）：
> 方案 A（含摘要质量修）与工具结果 L1/L2 已实施并合入本分支；
> 方案 B（预检压缩：`PreTurnCompaction` + `maybePreCompact` + `compactedThisTurn` 防双压）
> 随后同分支实施；L3、C 未做。以下为 review 后已决事项——
> error 轮 toolResult 全文保留为已决（token 代价由 L3 跟进）；
> `continue()` 抛异常路径沿既有惯例只发 `sp:turn-end` 不落盘；
> `read_file` 越界 offset 返回明确提示而非空页；
> 截断标注中英混杂（`[output truncated]` / 中文标注）记为 i18n 例外（工具输出面向 LLM）；
> MCP 与 `read_card` list/meta/entries 未封顶残留由 L2 wire 兜底。

## 问题一句话

截停轮被落盘为 error 消息，用户手发“继续”走新 turn 而非续写，
叠加压缩把当前任务摘要化、tail 抹掉失败轮、无发送前预检，
导致答非所问（详见 `./README.md §4`）。

## 三个递进方案

| | A：自动 retry | B：预检 + 自动 retry | C：opencode 式重构 |
|---|---|---|---|
| 解决 | 主因 1（走错恢复路径） | A + 次因 4（无预检） | 全部成因 |
| 工期 | 1–2 天 | 3–5 天（含 A） | 2–3 周，架构性 |
| core 改动 | `agent-runner.ts` 约 40 行（含重试上限与摘要质量修） | + 预检/注入约 60 行（不动 `Capability` 接口） | Runner 循环重构 |
| contracts/server/app | 零改动 | 零改动 | contracts + UI 语义变更 |
| 残留 | 仍可能二次截停；无预检 | 发送延迟 +60s；工具循环中途仍靠 afterTurn | 与现有 error/retry 前端契约冲突 |

## 前置依赖状态：09-21 bugfix 落地情况（2026-09-30 核对）

设计文档头部仍写“修复草案（未实施）”，已过时（历史文档按规范不回改，此处记录现状）：

| 条目 | 状态 | 证据 |
|---|---|---|
| P0-1 退化轮记失败 | ✅ 已落地 | `context/truncated-turn.ts`（`isTruncatedTurn`/`markTruncated`/`rawStopReason`）；`agent-runner.ts` 的 `appendMessageEvent` + `persistMiddleware` 已接入；提交 `4c07591` |
| P0-2 硬阈值分支 | ✅ 已落地 | `CompactionOptions.hardRatio/targetRatio` + `overHard` 分支（`compaction.ts:19-20,118`）；提交 `4c07591` |
| P0-3 溢出强制压 + 实测窗口 | ✅ 已落地 | `transform.ts` 的 `overflowed` 强制分支（58）+ `observedWindow`（53）+ `keep=1` 收紧（80）；提交 `4c07591` |
| P0-4 思考折叠 + 错误诊断 | ✅ 已落地 | `entry.ts:49-51`（`_thinking/_thinkingTruncated/_diagnostics`）、`chat-tool-projection.ts:28,90`、空消息豁免（`entry-reducer.ts:344`）、`AssistantBubble` 的 `data-chat-thinking`、`ErrorMessageSection` 的 `data-chat-error-detail`、三语 i18n（`chat.thinking.*`/`chat.error.detail.*`）；提交 `4c07591` |
| P0-5 工具结果硬上限 | ✅ 部分落地 | `tools/output-limits.ts`（总量 32KB + 单行 500 字 + 截断标注）仅 `search_content` 接入（100 条上限 + 总量截断，有测试）；`read_file`/`read_card`/`list_files`/`load_skill`/MCP 均未封顶；合并提交 `06838d5` |
| P0-6 检索大字段排除/降权 | ❌ 未做 | 无索引层字段排除；仅 P0-5 的输出侧截断部分覆盖 |
| P0-7 渐进式读取 | ❌ 未做 | `read_file` 无 `offset/limit` |
| P1-1 custom 窗口默认值 | ❌ 未做（设计明确不做） | `catalog.ts:100` 仍为 `131072` |
| P1-2 手动压缩入口 | ❌ 未做 | 见 README §6 可行性，仍有效 |
| P1-4 发送前 prompt 估算落盘 | ✅ 已落地 | `pendingPromptEstimate`（`agent-runner.ts:75,264,325`）+ `readPromptEstimate`；提交 `4c07591` |
| P1-5 发送前悬空 toolCall 清理 | ❌ 未做（设计明确不做） | `sanitizeToolCallPairs` 仍仅压缩路径调用 |

结论：本方案的 A/B 均建立在 P0-1/2/3 已落地的基础上；P0-5 只封了 `search_content`、
`read_file` 全文无上限、MCP 全部无上限（见下节），“单条工具结果撑爆”仍是最高频触发源。

推荐路径：立即做 A（含摘要质量修）+ 工具结果 L1/L2；A 验证有效但有残留再做 B；
C 待 A/B 稳定后另起设计阶段。

## 单条工具结果撑爆：三层防御（2026-09-30 讨论结论）

现状盘点：`search_content` 已封（500字/行 + 32KB 总量 + 100 条）；
`run_command` 各流 100KB（≈25k tokens/流）；`read_file` **全文无上限**
（`read-file.ts:71-75`）；`read_card` entry/many 全文（`jsonBlock`）；
`list_files` 递归无上限；`load_skill` 全文；MCP 工具结果原样入上下文
（`mapMcpContent` 无封顶，`read_resource` 的 blob 转 `data:` URL）。
两个关键事实：`details` 不进模型上下文（`convertToLlm` 只投影 `content`，
`agent-assembly.ts:247-255`）；`contextProjectors` 是 wire 路径的统一投影点。

- **L1 源头封顶（补全 P0-5，必做）**：`read_file` 加 `offset/limit`（即 P0-7），超限
  返回前 N + `details.truncated/totalLength` 并提示续读；`read_card` entry/many、
  `list_files`（行数上限）、`load_skill` 接入 `output-limits.ts`；
  `run_command` 100KB → 32KB 对齐。优点：估算准确、UI 可显式提示。
- **L2 统一兜底（新增，覆盖 MCP 的唯一手段）**：新增 `tool-output-budget`
  capability，注册 `contextProjector` 对每条 `toolResult` text 做 32KB 截断 + 标注。
  一处生效，覆盖全部本地工具、MCP 与未来新工具；不改动落库/UI 历史。
  代价：`readCurrentTokens` 仍按原始 log 估算（偏保守、略早压，可接受）。
- **L3 压缩期收缩历史工具结果（可选，二期）**：把“最近 N 轮之外”的 `toolResult`
  正文替换为占位（保留 toolCall 结构 + 首行），直接提升压缩有效性、缓解
  “压缩后仍超窗”。收益与复杂度都高于 L1/L2。

推荐 **L1 + L2 一起做**：L1 负责“别产生”，L2 负责“兜住 MCP 和漏网”。
L2 范围：**仅单条上限**，不做工具结果总量占比控制（占比交给压缩）。

## 各方案优缺点

### A

优点：压缩时机不动，风险最小；解决约 80% 场景（截停后立即续写通常能
完成）；附带最小摘要质量修（改动 4）；与现有 error/retry UI 完全兼容。

不足：仍可能二次截停（需用户手动 retry）；无预检，“继续”轮仍可能先爆一次。

### B

优点：绝大部分截停场景被预检提前压缩消除；压缩后自动 retry 不再叠第二层摘要；
短会话预检开销可忽略。

不足：首次超窗时发送延迟增加（上限 60s，等待期间暂无压缩中 UI 反馈）；摘要质量问题仍存在
（主因 2/3 未根除，需靠 A 的改动 4 缓解）；只覆盖发送前，工具循环中途超窗仍靠 afterTurn 兜底。

### C

优点：根除全部四个成因；用户体验最佳（无感压缩、自动续跑）；与 opencode 对齐，
长期可维护。

不足：改动面大，触及 Runner 核心循环；需重定 error 与 compaction 的 UI 语义，
与现有 `turn/end: error` + retry 按钮的前端契约冲突；前置 P0-1~P0-5 均已落地，
可直接立项设计，无需再等。

## 方案 A：截停后自动 retry

前置：P0-1（`markTruncated` 落盘 error）与 P0-3（afterTurn 溢出强制压）已落地，
本方案才能成立——auto-retry 的上下文是压缩后的上下文，而非原超窗上下文。

### 改动 1：`packages/core/src/session/agent-runner.ts` · `persistMiddleware`（600–632）

截停轮（`markTruncated` 后 `stopReason==error && rawStopReason==length`）不落
`turn/end`，改为从 `eventLog.events` 反查末条 `assistant/message` 的 seq，
落 `turn/retried{abandonedSeqs:[该seq]} + turn/start`，并置 `needsAutoRetry = true`；
其余分支保持现有 `error/aborted/completed` 映射。
（`persistMiddleware` 的 `agent_end` 分支不持有入库 seq，必须反查，不能复用
`event.messages` 里的内存对象。）

### 改动 2：同文件 · `sendMessage`（183）/`retryLastTurn`（286）收尾

**顺序关键**：检查点放在 `await applyAfterTurnHooks()` **之后**、`finally` 之前——
必须让 afterTurn 的强制压缩先腾出空间，否则 `continue()` 用同一超窗上下文必再截停。

```ts
if (this.needsAutoRetry && this.autoRetryCount < 1) {
  this.needsAutoRetry = false;
  this.autoRetryCount += 1;
  this.syncBufferFromLog();   // 失败轮已被 turn/retried 废弃，末条回到 userA
  this.resetToolLoopGuard();
  try {
    await this.agent.continue();   // 前置：末条必须非 assistant，否则 pi 抛错
    await this.applyAfterTurnHooks();
  } catch (err) { /* 转下 */ }
}
if (this.needsAutoRetry || err) {
  this.needsAutoRetry = false;
  this.eventLog!.append("turn/end", { reason: "error" });
  this.emitTurnEvent("sp:turn-end", { ... reason: "error" ... });
}
```

`autoRetryCount` 在每次 `sendMessage`/`retryLastTurn` 入口清零：最多自动续一次，
二次截停落 error，等用户手动 retry（防死循环；手动 retry 视为新 episode）。

### 改动 3：`AgentRunner` 新增 `private needsAutoRetry = false; private autoRetryCount = 0;`

### 改动 4（并入 A）：摘要质量修，主因 2/3 的最小止血

- `sanitizeToolCallPairs` 不再整体丢弃 error 轮：保留 error assistant 的 user 前文与
  error 标记（指代不断），仅剔除其悬空 `toolCall` 对应的 `toolResult`；
  `excludedSeqs` 语义不变（仍记录被剔除的 seq）。
- `buildSummaryInstruction` 增加一条：最近一轮未完成任务的精确步骤、涉及文件路径、
  工具参数必须原样保留，不得概括。

### 边界

- 自动 retry 期间用户 abort：`inFlight` 仍为 true，可正常打断。
- 二次截停：落 error，等用户手动 retry（与现状一致）。
- 压缩时机不变：自动 retry 的 `afterTurn` 照常触发压缩。
- 仅覆盖空截停；`length` 且有正文的轮次不在此路（`isTruncatedTurn` 判据，见 README §4 边界）。

### 待确认（已决，2026-09-30）

- `sp:turn-end`：截停的 `agent_end` **不发**；成功续写由 `continue()` 自己的
  `agent_end` 正常发 `completed`；仅续写失败时补发 `error`——每个逻辑 turn
  恰好发一次。
- 自动 retry 上限：**1 次**；手动 `retryLastTurn` 视为新 episode，计数重置。

### 测试

- 截停 → 自动 `continue()` 一次成功：`turn/retried` 落盘、`turn/end` 为 completed、无残留 error 气泡。
- 二次截停 → 落 `turn/end: error`，不再第三次 retry。
- 非截停 error/aborted 路径不受影响。

## 方案 B：预检压缩 + 自动 retry（含 A）

### 改动 4：`packages/core/src/capabilities/compaction/index.ts` 暴露具名函数

```ts
export type PreTurnCompaction = (
  eventLog: SessionEventLog,
  agent: Agent,
  sessionId: string,
) => Promise<void>;

export function compactionCapability(deps: MaybeCompactDeps): Capability & {
  preTurnCompaction: PreTurnCompaction;
}
```

`preTurnCompaction` 即绑定了本会话 `logger` + `windowStore` 的 `maybeCompactLog`
（必须复用同一 `windowStore` 实例，否则动态窗口学习丢失）。**不改通用
`Capability` 接口**——由装配点按名取用，避免 ADR-0002 的分层破口
（`docs/official/architecture/core.md:27`：Runner 对具体能力零 import）。

### 改动 5：`packages/core/src/session/agent-runner.ts` 预检调用

**位置关键**：预检必须在 `append user/message + turn/start` **之前**执行。
若在入库后再 `syncBufferFromLog`，buffer 已含新 user，此时 `agent.prompt(user)`
会让 pi 的 `runLoop` 再次 push 同一 user（`agent.js:116,123`），上下文出现重复。

```ts
// sendMessage：slash 展开 + ensureModel 之后、appendBatch 之前
this.compactedThisTurn = false;
if (this.deps.preTurnCompaction) {
  try {
    const projected = deriveMessages(this.eventLog!.events);
    const estimate = readCurrentTokens(
      [...projected, sanitizedUserMessage as never],
      this.agent.state.systemPrompt,
    );
    if (estimate > window * thresholdRatio) {   // 与 planCompaction 同口径，先算账再调
      await this.deps.preTurnCompaction(this.eventLog!, this.agent, this.sessionId);
      this.syncBufferFromLog();
      this.compactedThisTurn = true;
    }
  } catch (err) {
    this.deps.logger.warn({ err, sessionId: this.sessionId },
      "pre-turn compaction failed, continuing without compaction");
  }
}
```

`AgentRunnerDeps` 新增 `preTurnCompaction?: PreTurnCompaction`（`retryLastTurn`
同理，在 `appendBatch turn/retried + turn/start` 之前调用）。

### 改动 6：`packages/core/src/factory.ts`（52 附近）注入

`compactionCapability()` 实例化后取其 `preTurnCompaction`，随 Runner deps 传入；
`sendMessage`/`retryLastTurn` 入口清零 `compactedThisTurn`（`factory` 传参已天然
支持测试替身注入，无需额外设计）。

### 改动 7：`transform.ts`（28）防双压——per-turn 标志，而非查近 N 条

原“近 3 条含 `compaction/applied` 则跳过”**不成立**：预检压完后紧跟的是
`user/turn-start/assistant…`，`afterTurn` 时近 3 条里没有压缩事件，会二次压缩。
改为：`AgentRunner.applyAfterTurnHooks` 开头若 `this.compactedThisTurn` 为真则跳过
本轮压缩（预检刚压过，`tail` 已满足 `targetRatio`，事后 `plan` 本就大概率为 false，
标志只是兜底）。

### 性能与反馈

- `<0.75w` 短会话预检仅做估算（<1ms），无损。
- 首次超窗延迟上限 60s（摘要超时）；system prompt + tools 前缀复刻，
  provider prompt cache 命中时显著更快。
- 等待期间 live 无压缩 UI（`compaction/applied` 当前仅推进游标）：建议前端在
  `run_status active` 持续超过阈值时显示“正在压缩上下文…”（纯前端改动，可选）。

### 测试

- 预检触发压缩：超窗发送 → `compaction/applied` 落在 `user/message` 之前，
  buffer 无重复 user。
- 预检失败不阻塞 turn：摘要抛错 → warn 后正常发送。
- 预检压过后 afterTurn 不二次压缩。

### 待确认（已决，2026-09-30）

1. 预检失败策略：**关闭该决策点**——预检直接调用 `maybeCompactLog`，其内部已有
   失败分支（`≤0.9w` warn 跳过、`>0.9w` 机械摘要兜底，`transform.ts:106`），
   不引入“拒绝发送”新路径。

## 方案 C：opencode 式重构（纲要，未展开）

1. `AgentRunner` 增加 `runLoop`：每次调 agent 前查 overflow → 先压缩 → 再发送，
   循环至完成或真正失败。
2. 流式中途 usage 接近窗口时主动掐断（需 pi-agent-core 支持或包装 stream）。
3. 压缩为内部任务，不落盘 error 消息，压缩完自动发合成“继续”消息。
4. 摘要增强：`sanitizeToolCallPairs` 保留 error 轮指代；digest 指令强制保留最近
   未完成任务的精确步骤/路径/参数；预算 5% → 10%（1500~20000）。
5. 前端：截停 UI 改为“正在压缩上下文…”进度态，不显示 error。
