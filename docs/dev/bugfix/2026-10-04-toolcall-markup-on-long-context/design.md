# 长上下文下模型把工具调用写成明文标记（invoke / parameter），调用未发出且 app 无检测

- 日期：2026-10-04
- 状态：调查完成，未修复
- 影响文件（候选）：`packages/core/src/session/agent-runner.ts`（检测与落盘）、`packages/core/src/context/truncated-turn.ts`（判据扩展）、`packages/core/src/capabilities/compaction/transform.ts`（阈值 / 强制压缩）、`packages/core/src/model-providers/catalog.ts`（自定义提供方窗口口径）
- 相关既有条目：`2026-09-21-empty-turn-on-context-overflow`（空回 / 1-token）、`2026-09-22-search-content-oversized-result`（单条工具结果顶穿）

## 现象

长会话里，助手消息把工具调用写成**正文文本**。开标签形如 `<invoke name="run_command">` 与 `<parameter name="command">`，并连同对应的闭合标签一起以纯文本出现；部分消息还夹带模板特殊 token（全角竖线包裹的标记混进标签名）。这是模型模板里的原生调用格式，而不是合法的 OpenAI `tool_calls`。

- 这些标记没有变成结构化 `tool_calls`，工具不执行。
- 用户观感：助手在「自言自语」，任务不推进。
- 分两类：
  - **完全没发出**：`content` 里没有任何 `toolCall` 块、`stopReason` 为 `stop`（工具真的没跑）。
  - **发出但正文脏**：同时存在合法 `toolCall` 与泄漏标记（工具跑了，回复里带脏文本）。

实证（某长会话，37 轮）：22 条助手消息正文含明文标记；其中 **8 条完全没有 `toolCall`**（工具未执行）。这 8 条的请求 prompt 全部 ≥ 233,840 tokens，其中 7 条落在 337,805–358,507。同一会话在 23 万 token 之前，工具调用一律是标准 `toolCall`。

## 根因

- 该模型（某 `-flash` 模型）经 `custom` 提供方走 `openai-completions` 路由（`catalog.ts`），`reasoning: false`。
- 模型原生工具调用使用特殊 token / XML 模板（DSML 风格）。正常应由服务端或适配层解析成标准 `tool_calls`。
- 在**长上下文退化**时，模型回退到直接输出模板 token；该路由不解析这种格式，于是整段落进 `content` 正文。
- 关键判据：**只在长上下文出现**（本会话实测从约 23.4 万 token 起），短/中上下文不出现 → 不是协议层缺口，而是「上下文过长导致的能力退化」。
- 与 `2026-09-21-empty-turn-on-context-overflow` 同源（都是上下文过长），区别是表现不同、退化起点更早：
  - 本类：约 23 万起，工具调用格式崩坏（明文标记 / 未发出）。
  - 空回类：约 33.7 万起出现 1-token 输出，约 100 万触发硬截断。
- app 无任何检测或自愈：`isTruncatedTurn` 只认「`length` 且无 `text` / `toolCall`」，而本类消息 `stopReason` 多为 `stop`（或本就带 `toolCall`），完全落在判据之外；最终落盘为正常消息，不报错、不提供重试。
- 自强化：坏样例留在 history 里，后续每轮继续照抄（模型自己也承认「反复犯同一个错误」）。

## 与既有修复的关系

- `2026-09-22-search-content-oversized-result` 与后续的工具输出三层防御（L1/L2/L3）、发送前预检压缩已落地，能压住「单次工具结果顶穿」和「多轮累积」。
- 但它们都**不覆盖「长上下文格式退化」**：投影层只保证送入上下文有界，不改变模型在约 23 万+ 就退化的事实；也没有「正文标记探针」。
- 另外，实测可用区间远低于官方标称窗口：标称 1M 的路由，实测约 23 万即开始格式退化。压缩 / 告警阈值必须按实测定，而不是填一个接近标称的大数。

## 修复方向（未实施，供决策）

- **P0 正文标记探针**：`assistant/message` 落盘前扫描 `content` 文本里的 `<invoke` / `<parameter` / 特殊 token 标记；命中即视为「格式退化轮」，复用 `markTruncated` 路径标 `stopReason: error` 与 `errorMessage`，走既有「可见 + 可重试」链路。
- **P0 阈值按实测**：把「实测退化点」记回会话可用窗口（复用 `observedWindow`），在首次标记 / 截断轮后下调，触发更早压缩；或检测到标记轮时强制压缩一次（`thresholdRatio: 0`）。
- **P1 送请求前清理**：对历史 assistant 正文里的标记做剥离 / 替换，避免坏样例自我强化（与 `sanitizeToolCallPairs` 同一层处理）。
- **P1（可选）标记改判 + 重试**：对「只有标记、无 `toolCall`」的消息，剥离标记后自动重试一次。不建议尝试把标记解析回 `toolCall`（风险高、收益低）。
- 口径决策（需拍板）：标记探针是否也覆盖「带 `toolCall` 但正文有标记」的脏消息。倾向只做剥离，不判错。

## 测试

- runner：构造 `content` 含明文标记的 assistant 消息 → 落盘 `stopReason: error` + `turn/end reason: error` + 可 `retryLastTurn`；正常 `toolCall` 不受影响。
- 压缩：末条为标记退化轮 → 即使用量低于 `0.75 × window` 也 `compaction/applied`。
- 阈值：首次标记 / 截断轮后 `observedWindow` 下调并被后续 `planCompaction` 采用。

## 已排除 / 未展开

- 已排除「服务端普遍不解析 DSML」：同一路由短上下文不发散，长上下文才出现 → 是退化，不是协议缺口。
- 未做跨提供方对照（需真实请求）；未验证其它模型 / 路由是否同样在约 23 万退化。
- 未量化「剥离历史标记」对恢复的影响（需改代码后实测）。
