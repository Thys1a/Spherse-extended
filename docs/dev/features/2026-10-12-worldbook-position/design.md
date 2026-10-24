# worldbook 多注入位置点设计

- 日期：2026-10-21
- 状态：设计已定，待实现
- 版本：v1.0.3（与预算项、状态数据外链同批）
- 来源：`positions-card-op.md` §一（四档结论）＋ 2026-10-21 评审决议
- 关联：`../2026-10-12-worldbook-budget/`（预算删除）、`../2026-10-11-state-data-link/`（共用插入 helper）

## 一、范围：一次性落地

本次同时落地 P0 / P1 / P2 / P3b，不分阶段；P3a（system-role 消息）/ P4（assistant 伪装）明确不做。

含：card.json 字段（`position` 数字枚举 + `depth`）、projector 分组注入、system 侧写入 hook、contracts / 工具 schema、测试、tuning doc 同步。

不含：位置选择 UI（无世界书管理 UI，位置只走 card.json / `edit_card`，优劣写进文档与工具说明）、agent 级默认位置（profile 不动）、`extensions.*` 开放与 `agentCards` 新 op（见 `positions-card-op.md` §二/§三，另行立项）。

## 二、数据模型：数字插入点

### 2.1 编号（数字越大离输出越近、注意力越强）

| position | 含义 | 身份 | 实现槽位 |
|---|---|---|---|
| 0 | system，MCP 之前 | systemPrompt 一部分 | `turnHooks.beforeTurn`，插到 MCP 哨兵前 |
| 1 | system，MCP 之后（system 侧推荐） | systemPrompt 一部分 | `turnHooks.beforeTurn`，追加到 systemPrompt 末尾 |
| 2 | 历史锚点，需配合 `depth` | user 消息 | projector，插到倒数第 N 个 user 段之前 |
| 3 | 当前用户消息之前（默认，推荐） | user 消息 | projector，`slice(0, -1)` 插入 |
| 4 | 队尾，当前用户消息之后（旧行为，可选项） | user 消息 | projector，末尾追加 |

`depth?: number`：仅 `position === 2` 时有效，整数 ≥ 1，表示“倒数第 N 个 user 段”。`depth = 1` 等价 3，`depth` 越大离当前输入越远、近因越弱。

### 2.2 各位置优劣（同步写入 `EDIT_CARD_GUIDE` 与将来 UI 提示）

- 0：MCP 工具约束成为 system 最后一句，优先级最高；代价是 worldbook 一变 MCP 也失去缓存，且世界书注意力最弱。
- 1：稳定前缀（含 MCP）可缓存，worldbook 只破坏尾部；且最靠近用户输入，system 侧注意力最强。system 侧默认选 1。
- 2：把世界书固定在“离当前输入固定距离”的历史位置，越深越像背景设定，不抢占当前输入与输出之间；代价是 compaction 后重新锚定（digest 占一段），同 depth 跨轮指向不同真实轮次。
- 3：平衡点，世界书作前导语境、真实输入仍居末位。默认选 3。
- 4：注意力最强（近因），但世界书挡在当前输入之后，旧行为保留作可选项。

### 2.3 旧值归一

`position` 历史上从未被运行时读取（`worldbook.ts` 只用 `insertion_order`），故全部归一，不保留语义：

- 缺失 / `""` / `"before_char"` / `"after_char"` → 3。
- 归一发生在 `normalizeEntry`（读）与 `canonicalEntry`（写默认 3）两处；磁盘原值不动（读时映射，不回写）。

### 2.4 校验规则

- `position`：整数 0..4，其他值写侧拒绝。
- `depth`：`position === 2` 时必填（add 缺失则 `InvalidFieldError`）；`position !== 2` 时携带 `depth` 写侧拒绝；`depth < 1` 或非整数拒绝。
- `update`/`bulk` 只做单字段类型校验；`position === 2` 但存量无有效 `depth` 的条目，运行时回退到 3 并 `logger.warn`。
- `canonicalEntry` 仅在传入 `depth` 时写出该键，默认新增仍是现有键集合（不断言键数测试）。

## 三、运行时

### 3.1 共享选择函数（messages 侧与 system 侧共用）

```ts
selectWorldbookEntries(entries: CardEntry[], messages: readonly AgentMessage[]): Map<PositionKey, CardEntry[]>
```

步骤：`matchWorldbook(recentTextOf(messages), entries)` → 预算步骤（见 §六）→ 按 `(position, depth)` 分组 → 组内保持 `insertion_order`。

两处调用方（projector 与 system hook）各自对同一输入调用本函数，结果确定一致，不存在“预算算两次”问题（各自只消费自己位置分组）。

### 3.2 messages 侧（2 / 3 / 4）

#### 背景：回合与分界（必读，否则 depth 语义易误解）

一个“回合” = 一次“用户发消息 → 模型彻底答完”。答完之前模型可能发起多次工具调用，故一个回合在 wire 上表现为：一条 `user` 消息，后跟若干 `assistant` / `toolResult`。**每条 `user` 消息都是一个回合的起始标记**，即回合分界 `┆`：

```text
回合1                          回合2              回合3（进行中）
[U1 → A1(tc) → T1 → A1'] ┆ [U2 → A2(tc) → T2 → A2'] ┆ [U3 → A3(tc) → T3 → …]
```

插入点**只允许落在分界上（某条 user 消息之前），永不落在回合内**——回合内的任何空隙（`assistant(toolCall)` 与其 `toolResult` 之间、`toolResult` 与后续 assistant 文本之间）下刀都会拆散“提问→回答”的配对。因此 depth 不数消息条数，只数 user 分隔线；WB 对模型而言只是在新回合开口前多递了一张背景小抄，不改动原有对话一字一句。

depth 落点（`n = position === 3 ? 1 : depth`），恒为“从尾部倒数的第 n 个分界”：

- 单回合 `[U1]` + depth=1 → messages 第 0 位，完整 prompt 里紧贴 MCP 之后：`[systemPrompt … MCP] ┆ [WB] [U1]`（效果约等于位置 1）。
- 双回合 → 回合1 与回合2 的分界：`[U1 … A1'] ┆ [WB] [U2 …]`。
- N 个回合 → 恒为最后一个回合与前一个回合之间，不随历史长度漂移（depth=1 即“当前回合开口之前”，故定为默认）。

#### 插入算法

- 4：`[...messages, block]`。
- 3 / 2：同一函数，`n = position === 3 ? 1 : depth`：

```ts
const userIdx = messages.flatMap((m, i) => (m.role === "user" ? [i] : []));
const target = userIdx.length >= n ? userIdx[userIdx.length - n] : 0; // 超限 clamp 到最前
return [...messages.slice(0, target), block, ...messages.slice(target)];
```

- 插入点恒为某条 user 消息之前（段首），永不切开 `assistant(toolCall) → toolResult` 对子；不按 raw 条数计数。
- 所有插入下标先对原始数组一次算好再倒序落位，避免多块互相漂移。
- 每个分组渲染一个 `<worldbook>` 块，包装格式不变（`recentTextOf` 剥离正则不改，不加属性）。
- 与状态数据外链共用“插到当前用户消息之前”helper（3 即该 helper 的特例）。
- user 侧不同插入点数量不做硬限制；文档与工具说明建议少于三个（每个 user 块 +1 pruning segment，会挤压 toolResult 保留窗口）。

### 3.3 system 侧（0 / 1）

新增独立 capability `worldbookSystemCapability`，注册在 `createMcpCapability` **之后**（turnHooks 按 capability 注册序串行，见 `kernel/turn-hooks.ts:29-33`、`session/runtime.ts:99-104`；card 自身在 builtin 早于 MCP，不能复用）。

`beforeTurn(agent, pendingUserText?)` 每轮执行（`pendingUserText` 由 `sendMessage` 在用户消息落库前传入，`agent-runner.ts:223`；`retryLastTurn` 无新输入，传空，此时历史里已有被重试的用户消息）：

1. 用 `selectWorldbookEntries(readAgentWorldbook(...), scanMessages)` 取 0 / 1 分组，其中 `scanMessages = [...agent.state.messages, pendingUserText]`（无 pending 文本时即历史本身；不读 wire 投影，避免与消息侧重复）。首 turn 历史为空时 constant 仍命中（`matchWorldbook` 恒包含），key 条目按本轮输入匹配——不存在“一 turn 滞后”。
2. 剥掉本 capability 的两个既有区块（哨兵注释，避免误剥 MCP 块）：

```text
<!-- spherse:worldbook:before-mcp:start --> … <!-- spherse:worldbook:before-mcp:end -->
<!-- spherse:worldbook:after-mcp:start --> … <!-- spherse:worldbook:after-mcp:end -->
```

3. 0：插到 MCP 哨兵 `<!-- spherse:mcp-context:start -->` 之前（`mcp/block.ts:17` 哨兵需导出为常量）；无 MCP 时与 1 同（追加末尾——此时“之前”无定义，追加可保持缓存友好与行为可预测）。
4. 1：追加到 `systemPrompt` 末尾。
5. 无命中只做剥离。

projector 无 logger 可用（`SessionView` 不含 logger），“≥3 个插入点 warn”降为纯文档与工具说明建议，不做运行时 warn。

效果：`getTurnContext`（`agent-runner.ts:480-490`）与 token 状态（`readCurrentTokens` 计入 systemPrompt）天然可见；`applyReload` 后下一轮自动补回。

已知不对称（实现后写入 tuning doc）：messages 侧每次 LLM 调用重算（含附件处理后的文本），system 侧每 user turn 只算一次（`agent-runner.ts:223`），匹配文本为历史 + 本轮纯文本（不含附件展开），tool loop 内为 turn 起始快照。

## 四、写入链路触点

| 文件 | 改动 |
|---|---|
| `core/capabilities/card/types.ts` | `CardPosition` 改为 `0 \| 1 \| 2 \| 3 \| 4`；`CardEntrySummary` / `EntryPatch` 加 `depth?: number` |
| `core/capabilities/card/parser.ts` | `normalizeEntry`：数字 0..4 保留；旧字符串/缺失归一为 3；读 `raw.depth`（整数 ≥ 1 校验） |
| `core/capabilities/card/card-store.ts` | `WRITABLE_FIELDS` 加 `depth`；`validatePatch` 按 §2.4 加规则；`canonicalEntry` 默认 `position: 3`、`depth` 条件写出；`toSummary` 透传两字段 |
| `core/capabilities/card/search.ts` | 搜索摘要补 `position` / `depth`（与 `toSummary` 是两处） |
| `core/capabilities/card/tools.ts` | `CardEntryBody` 加 `position`（0..4）/`depth`；`EDIT_CARD_GUIDE` 追加 §2.1 优劣说明；`errorText` 可写字段列表同步 |
| `core/capabilities/card/worldbook.ts` | §3.1 分组（`selectWorldbookEntries` 返 `WorldbookInsertionGroup[]`）＋ §3.2 插入（`userSegmentIndex`）；缺 depth 回退 3 在此发生，warn 由 system hook 发出 |
| `core/capabilities/card/capability.ts` | `worldbookSystemCapability`（beforeTurn 读历史 + 本轮文本 → 剥双哨兵区块 → 0/1 写入；缺 depth warn 一次/hook 实例） |
| `core/factory.ts` | 注册 `worldbookSystemCapability`（MCP 之后，logger 透传） |
| `core/capabilities/mcp/block.ts` | 导出 MCP 哨兵常量（供 worldbook 定位 0 号插入点） |
| `contracts/card.ts` | `cardPosition` 改数字枚举；`entryPatch`（`additionalProperties: false`）加 `depth`；summary / entry / search 响应加两字段 |
| `server/routes/card.ts` | 透传；补 depth 往返测试 |
| `app` / SDK | 类型自动跟随，无逻辑改动 |

## 五、测试

必须改的既有断言：

- `worldbook.test.ts:201-213`：硬编码“末尾追加一条”，改为按 position 断言插入下标。
- `worldbook.test.ts:111-144`：预算断言按 §六二选一处理。
- `tool-output-budget.test.ts:96-146`：若管线含 worldbook 需重钉 segment 算术；`135-146`（digest 算段）语义不得破。
- `t3-card-store-write.test.ts:204-217`：默认 add 键集合不变；新增带 depth 的 add、非法组合拒绝用例。
- `t2-search-store-read.test.ts` / `t1-path-guard-parser-cache.test.ts`：`depth` optional 不破 typed literal；补解析/摘要断言。
- `contracts/card.test.ts` / `server/card-routes.test.ts`：depth 接受、非法 position / 非法 depth 拒绝。

新增：0/1 两序与 MCP 哨兵组合（有/无 MCP）、2 的 depth=1/2/超限 clamp、多 position 同时命中、系统区块剥离幂等、无命中只剥离、at_depth 缺 depth 回退 3 + warn、时序用例（state 无本轮文本 + pending 文本；`getTurnContext` 级集成未补——hook 写 state 即其读取源，见 `agent-runner.ts:480-490`，全会话集成成本过高，降为未覆盖项）、与 attachments projector 组合顺序。

## 六、与预算项的衔接

§3.1 的“预算步骤”按合入顺序二选一：

- 预算删除先合入：删去该调用，分组直接进行。
- 本项先合入：保留 `applyWorldbookBudget(hits)` 调用（现有全局语义：先预算再分组，system 侧同源），预算删除合入时一并删去。

## 七、验收标准

1. 五个插入点各有一条端到端用例（匹配 → 分组 → 插入/写入，wire 快照断言下标或 systemPrompt 相对顺序）。
2. `npm run verify` 通过（lint + build + typecheck + test）。
3. tuning doc 第 9 行与待验项 #4 同步更新；`positions-card-op.md` §四决策点 1/2/5 结清为本设计链接。
