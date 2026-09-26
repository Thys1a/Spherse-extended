# 聊天「空回」：上游截断被记为 completed + 压缩闸门失效

调研时间：2026-09-21
状态：**修复草案（未实施）**

## 一、现象

助手连续多轮回复为空气泡：没有报错、没有重试入口，点「继续」依旧空回，只有新开会话才恢复。集中在**工具输出极重的长会话**。

## 二、证据（来自 events 表）

所有空回的 assistant 消息都是同一种形状：`stopReason: "length"`，`content` 只有 `thinking`（无 `text`、无 `toolCall`），`output` 常常是 1 个 token。

| 会话 | 用户消息 | 助手轮 | compaction | 失败时 prompt | output |
|---|---|---|---|---|---|
|  `86e0d903` | 2 | 33 | 0 | 126,719 | 1（正文就一个「用户」） |
|  `8a98ebef` | 3 | 33 | 0 | 135,880 | 1 |
|  `4924b298` | 2 | 20 | 0 | 125,161 | 1 |
|  `00a5fa81` | 59 | 320 | 25 | 184,606 | 1 × 6 |

时间线（同一模型 `custom-go/deepseek-v4.1-flash`）：

- 09-19 / 09-20 白天：prompt 到 **278,818** 仍在正常出结果（09-12 甚至有 in=290,078 / 383,222 的成功记录）。
- **09-20 23:59:29** 起开始退化（8a98ebef，prompt 135,879 → 1 token），09-21 全天在 125k 以上反复复现。
- 09-21 12:29–12:31 同一会话切到内置 `opencode-go/deepseek-v4-flash`，180,069 的 prompt 正常回了 4,915 tokens；12:36 切回 `custom` 后 184,606 立刻 1 token。
- 12 次空回全部落在 **custom 提供方**（`custom-go/…`、`custom-opencode-go-custom/omen-alpha`、`custom-nvidia/…`）；内置 `opencode-go/*` 一次没空回（含 319k 的 `37bf8786`）。

## 三、判定

1. **直接原因在上游**：`finish_reason=length` + 只有推理没有答案，是退化补全。pi-ai 自己写着这个坑（`node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js:737-740`）：推理与答案共用输出预算，推理不设上限时会吃光整轮响应。
2. **app 把它当成功**：`packages/core/src/session/agent-runner.ts:498` 只把 `error`/`aborted` 判失败，`length` → `turn/end { reason: "completed" }`。前端 `chat-session-reducer.ts:127` 也只认 `stopReason === "error"`，于是既不报错也不给重试。
3. **压缩本该兜底却没兜住**（三个闸门叠加）：
   - `planCompaction`（`packages/core/src/context/compaction.ts:113`）在 `promptCount <= 20 && turnCount <= 40` 时直接放弃压缩——这些会话只有 2–3 条用户消息、20–33 轮，**token 早就超阈值也一次不压**。
   - 即使压了，`keepRecentPrompts=20 / maxTurns=40` 是逐字保留，工具输出极重的尾段自带 150k–210k（`00a5fa81` 压了 25 次仍停在 184k），压完还是超窗。
   - `CUSTOM_PROVIDER_DEFAULTS`（`packages/core/src/model-providers/catalog.ts:99`）给所有自定义模型统一 `contextWindow: 131072`，而 `maybeCompactLog` 的阈值就是 `0.75 × contextWindow` —— 对真实窗口更小的路线（omen-alpha 在 95k 就死）完全失准。
4. **没有自救路径**：`retryLastTurn`（`agent-runner.ts:253`）要求最后一条持久化消息 `stopReason === "error"`；core 里没有强制压缩入口，app/server 也没有 `/compact` 之类的命令，用户只能新开会话。

## 四、修复方案（草案）

> **优先级总览（含 2026-09-22 追加）**
>
> | 编号 | 一句话 | 状态 |
> |---|---|---|
> | P0-1 | 退化轮不记 `completed`，报错并可重试 | 必做 |
> | P0-2 | 越过硬阈值时不被"保留窗口"闸门挡住 | 必做 |
> | P0-3 | 溢出信号强制压缩 + 记实测可用窗口 | 必做 |
> | P0-4 | 前端折叠思考块 + 详细错误详情 | 必做（可见性） |
> | P0-5 | **工具结果硬上限 + 截断标注** | 必做（§8.9，主修"单条撑爆"） |
> | P0-6 | **`search_content` 排除大字段/降权** | 必做（§8.9） |
> | P0-7 | **渐进式读取（大文件先给摘要）** | 建议（§8.9） |
> | P1-1 | custom 提供方窗口元数据 | 需拍板（口径见 §8.6/8.7） |
> | P1-2 | 手动压缩入口 | 可选 |
> | P1-4 | 记录请求侧 prompt 估算 | **升 P0**（§8.7） |
> | P1-5 | 送请求前清理悬空 toolCall | 建议 |


### P0-1 溢出退化轮记为失败（可见 + 可重试）

`packages/core/src/session/agent-runner.ts`：只认 `length` 且整轮没有正文/工具调用时，把落盘消息标成失败（保留 `rawStopReason` 不丢原始事实），`turn/end` 跟着走 `error`。

`isTruncatedTurn` / `markTruncated` 三个文件都要用（P0-1 / P0-3），落一个共享模块（建议 `packages/core/src/context/truncated-turn.ts`，与 `compaction.ts` 同级），不要从 `session/` 反向 import 进 `capabilities/`。

```ts
function isTruncatedTurn(message: unknown): boolean {
  const m = message as { role?: string; stopReason?: string; content?: unknown };
  if (m?.role !== "assistant" || m.stopReason !== "length") return false;
  if (!Array.isArray(m.content)) return true;
  return !m.content.some((block) => {
    const type = (block as { type?: string }).type;
    return type === "text" || type === "toolCall";
  });
}

function markTruncated(message: unknown): unknown {
  if (!isTruncatedTurn(message)) return message;
  return {
    ...(message as Record<string, unknown>),
    stopReason: "error",
    errorMessage: "输出被上游截断：本轮没有产生正文或工具调用（疑似上下文超出模型可用窗口）",
  };
}
```

- `appendMessageEvent`: `this.eventLog!.append("assistant/message", { message: markTruncated(message) as never })`
- `persistMiddleware`: `const lastMessage = ...; const last = markTruncated(lastMessage) as { stopReason?: string } | undefined;` 之后再判 reason。

这样 `retryLastTurn` 的前置条件、前端 `_error` + 重试按钮、重开页面后的历史渲染全部沿用既有路径，**contracts / i18n / 前端零改动**。代价是落盘消息的 `stopReason` 不再是原始的 `length`（`rawStopReason` 仍在，可追溯）。

### P0-2 越过硬阈值时不再被「保留窗口」闸门挡住

`packages/core/src/context/compaction.ts`：`planCompaction` 增加硬阈值分支——token 越过硬线时缩小保留窗口，并按「压完要能装回窗口」反推保留量。

```ts
export interface CompactionOptions {
  currentTokens: number;
  contextWindow: number;
  keepRecentPrompts?: number;
  maxTurns?: number;
  thresholdRatio?: number;
  hardRatio?: number;      // 新增，默认 0.9
  targetRatio?: number;    // 新增，默认 0.5：压完目标
}
```

```ts
const hardRatio = options.hardRatio ?? 0.9;
const targetRatio = options.targetRatio ?? 0.5;
const overHard = options.currentTokens > options.contextWindow * hardRatio;

if (promptCount <= keepRecentPrompts && turnCount <= maxTurns && !overHard) {
  return { shouldCompact: false, anchorIndex: -1, tail: messages };
}

if (overHard) {
  const budget = options.contextWindow * targetRatio;
  for (let keep = Math.min(keepRecentPrompts, promptCount - 1); keep >= 1; keep--) {
    const split = Math.max(findPromptSplit(messages, keep), findTurnSplit(messages, maxTurns));
    if (split <= 0) continue;
    if (estimateTokens(messages.slice(split)) <= budget) {
      return { shouldCompact: true, anchorIndex: split - 1, tail: messages.slice(split) };
    }
  }
  const fallback = Math.max(findPromptSplit(messages, 1), findTurnSplit(messages, 1));
  if (fallback > 0) {
    return { shouldCompact: true, anchorIndex: fallback - 1, tail: messages.slice(fallback) };
  }
}
```

`estimateTokens` 已存在于 `packages/core/src/context/token-estimate.ts`，同目录直接 import。

### P0-3 溢出信号强制压缩（自愈）

`packages/core/src/capabilities/compaction/transform.ts`：检测到「上一轮就是空回」这个信号时，把阈值降到 0 强制压一次——它同时证明「真实窗口比配置的小」，压缩必须发生在下一次请求之前。

```ts
const overflowed = isTruncatedTurn(agent.state.messages[agent.state.messages.length - 1]);
const plan = planCompaction(messages, {
  currentTokens,
  contextWindow,
  ...(overflowed ? { thresholdRatio: 0, hardRatio: 0 } : {}),
});
```

`afterTurn` 每轮都跑，所以空回后用户发任意一条消息，就会走「强制压缩 → 下一轮正常」。两条卡住的会话也能这样救回来。

**8.7 之后追加两点**（阈值不固定 + 压缩路径自身会溢出）：

- 强制压缩后**要再校验一次可容纳性**：摘要失败会退化成机械摘要（`digestSource: mechanical`，实测只有 1KB），压缩后仍可能超窗；必要时允许降到 `keepRecentPrompts = 1 / maxTurns = 1`。
- 把**实测溢出点记回本会话**：一旦出现退化轮，就把该会话的可用窗口取 `min(配置值, currentTokens × 0.9)`（存 agent state 或会话级设置），后续压缩按这个更低的值触发。89,875 那次靠固定 131,072 是永远压不到的。

### P1-1 自定义提供方的默认窗口偏大（需要你拍板）

自定义提供方无法自动发现真实窗口，现在统一按 131,072 算，压缩阈值（0.75×/0.9×）因此偏晚。两个可选方向：

- A（保守默认）：`CUSTOM_PROVIDER_DEFAULTS.contextWindow` 降到 65536（甚至 32768）；代价是有 128k/256k 窗口的模型会过早压缩。
- B（显式化）：保持默认，但在提供方设置对话框把「上下文长度」标为必填并给提示；`maybeCompactLog` 在实测溢出后把 `min(配置值, currentTokens × 0.9)` 记为本会话的可用窗口。

倾向 B + A 的折中（默认 65536 + 提示必填）。**8.7 之后要更正一个预期**：单个固定值救不了这类问题（同一 provider 的不同请求可用窗口都不一致，压缩后 89.9k 也会中招），P1-1 只能"少踩雷"，真正的兜底是 P0-3 的动态可用窗口。

### P0-4 前端：折叠思考块 + 详细错误详情（可见性，本轮追加）

现状：`chat-tool-projection.ts:20` 的 `extractMessageText` **只取 `text` 块**，`thinking` 直接丢弃；所以截断轮在 UI 里是一条彻底空白的气泡，用户既看不到"模型其实思考了 3258 字后被截断"，也分不出 `length` 与 `error`。`ErrorMessageSection.tsx` 已有折叠 + `errorCode` + 重试，但没有可复制的诊断字段。

**P0-4a 折叠思考块**

- `packages/app/src/features/chat/types.ts`：`ChatMessage` 增加 `_thinking?: string`、`_thinkingTruncated?: boolean`。
- `chat-tool-projection.ts`：新增 `extractMessageThinking(content)`（收集 `thinking` 块的 `text`/`thinking`/`content` 字段）。
- `chat-session-reducer.ts`：`message_end` / `message_update` 时一并写入 `_thinking`；`stopReason === "length"` 时置 `_thinkingTruncated: true`。
- `MessageItem.tsx`：在正文上方渲染 `<details data-chat-thinking>`，`summary` 显示「思考 · {n} 字」+（被截断时）「· 已截断」，默认折叠，展开后 `whitespace-pre-wrap` 全文 + 复制按钮。
- 价值：① 截断轮不再"全空"；② 一眼分辨"模型想了但被砍"（length）与"请求根本没完成"（error，无 thinking）；③ 长会话可回看思考。

**P0-4b 详细错误详情**

- `ErrorMessageSection` 的折叠内容里补一个诊断块（`data-chat-error-detail`），字段：`provider / model`、`stopReason`、`rawStopReason`、`errorMessage`、`prompt = input + cacheRead`、`output`、`reasoning`、`sessionId`、`seq`。
- 数据来源：`message_end` 事件里已经有 `usage`、`rawStopReason`、`errorMessage`（见会话库里落盘的消息结构），reducer 把它们塞进 `_diagnostics`。
- 加一个「复制诊断信息」按钮（纯前端拼文本 + `navigator.clipboard`）。
- 配合 P0-1：`length` + 空正文被打上 `errorMessage` 后，这套详情会自然出现在截断轮上。
- i18n：新增文案加载 **i18n** skill，按 `chat.thinking.*` / `chat.error.detail.*` 命名。

### P1-2 提供手动压缩入口（可选）

app 侧加「压缩上下文」按钮或 `/compact` 命令 —— 目前 core 有能力、app/server 无入口，用户遇到超限只能新开会话。可并入 backlog。

### P1-3 工具输出瘦身（可选，独立议题）

> 2026-09-22 追加：本节原为"可选"。`a17679be` 证据（§8.8）表明**单条工具结果撑爆是独立且高频的触发源**，已升级为 **P0-5 / P0-6 / P0-7**（见 §8.9），不再是可选项。

`read_file` / `run_command` 常整块塞进上下文（30–60KB HTML 一读就是上万 token），是这次长会话的直接燃料。可考虑落盘时截断超长工具结果（保留头部 + 路径指引），或让压缩同时收缩历史工具结果。影响面大，另立条目。

## 五、测试

| 改动 | 测试 | 现有文件 |
|---|---|---|
| P0-1 | `stopReason: "length"` + 空 content ⇒ `turn/end` reason `error`；消息带 `errorMessage`；`retryLastTurn` 可执行 | `packages/core/src/__tests__/session/agent-runner*.test.ts` |
| P0-2 | 越硬阈值且 `promptCount <= keep` ⇒ 仍返回 `shouldCompact: true`；tail 估算 ≤ `targetRatio × window` | `packages/core/src/__tests__/context/compaction.test.ts` |
| P0-3 | 末条为空回时，`currentTokens < 0.75 × window` 也会落 `compaction/applied` | `packages/core/src/__tests__/capabilities/compaction.test.ts` |
| P0-4a | `thinking` 块被投影进 `_thinking`；`length` 轮标 `_thinkingTruncated`；空回仍渲染出「思考 · N 字（已截断）」 | `packages/app/src/features/chat/model/*.test.ts`、`MessageItem.test.tsx` |
| P0-4b | 错误详情字段齐全、可复制；无 `usage` 时不渲染该行 | `packages/app/src/features/chat/ErrorMessageSection.test.tsx` |
| 回归 | 正常 `stop=stop` / `toolUse` 不受影响；`@media` 无关 | 同上 |

验证链：`npm run verify`（lint → build → typecheck → unit）；core 单跑 `npm test --workspace=packages/core`。

## 六、影响面与文档同步

- 代码：`packages/core/src/session/agent-runner.ts`、`packages/core/src/context/compaction.ts`、`packages/core/src/capabilities/compaction/transform.ts`（P1-1 另含 `packages/core/src/model-providers/catalog.ts`）；P0-4 另含 `packages/app/src/features/chat/{types.ts,MessageItem.tsx,ErrorMessageSection.tsx,model/chat-tool-projection.ts,model/chat-session-reducer.ts}`
- 不动：`packages/contracts`（`turn/end.reason` 枚举保持 `completed|aborted|error`）
- i18n：P0-4 的新文案需加载 **i18n** skill 同步三语
- 文档：`docs/official/architecture/chat.md`（若有「turn/end 语义」节需补 `length` 折算规则）、`docs/dev/backlog.md`（P1-2 / P1-3 登记）

## 七、取舍与未采纳

- **不新增 `turn/end` reason `truncated`**：要动 contracts schema + WS 校验 + 前端 reducer + i18n，收益只是语义更准；先把「不静默」这个 P0 用最小改动做掉。
- **不在 client 侧重试**：空回的根因是上下文超窗，原地重试必然再空回；必须与压缩绑定（P0-3）。
- **不改 `keepRecentPrompts=20` 的默认值**：它是常规场景的合理保守值，问题只在硬阈值下缺少降级路径。

## 八、追加复核（2026-09-21 晚）："空回"不止一类，"短会话"指的是可见消息数

用户质疑"真的只有 context 爆掉一个原因吗，明明有两份记录很短"。逐条查完全部 40 个会话的 events 后，结论如下。

### 8.1 静默空回这一类，全部是「大 prompt + length + 无正文」

判据：`stopReason === "length"` 且 `content` 里既无 `text` 也无 `toolCall`（渲染出来就是空气泡）。扫描结果：**82 条空内容 assistant 消息分布在 22 个会话**，其中真正**静默**（`length`）的 16 条，prompt 从 95,496 到 184,607，**没有一条来自短 prompt**。其余 66 条是 `error` / `aborted`（下面 8.3 单独说）。

### 8.2 "记录很短"是可见消息数，不代表上下文小

用户消息条数少 ≠ 上下文小 —— agent 每轮把整份文件/技能塞进上下文：

| 会话 | 用户消息 | 消息总数 | 正文合计字符 | 单条最大 |
|---|---|---|---|---|
| 导入酒馆角色卡爱豆 `8a98ebef` | 3 | 79 | **247,902** | 37,943（`read_file` 一份 HTML） |
| 导入酒馆角色卡 `86e0d903` | 2 | 99 | **203,516** | 19,709（`load_skill` 技能全文） |
| 主题修复 `4924b298` | 2 | 50 | **105,227** | 64,358（一轮 assistant 输出） |
| 导入酒馆角色卡沈 `d3ce9f4c` | **1** | — | **540,688** | — |

所以"只运行一次就截断"是成立的：**第一轮里 agent 就把技能全文 + 卡片 JSON + 模板 + 参考样例读进来**，单轮就能到 60–95k；下一轮工具结果再进来就翻过模型可用窗口。**撤回重发"继续"没用**也是同一个原因 —— `withdrawLastTurn` 只摘掉最后一轮，180k 的上下文仍在，自然还是 1 token。

### 8.3 真正存在的第二类失败：上游把流掐断（`error`，usage 缺失）

`error` 且 `prompt = 0`（= 请求没有正常收尾，`usage` 全丢）的消息共 66 条，代表串：

| 错误串 | 出现次数 | 含义 |
|---|---|---|
| `Connection error.` | 6 | 传输层断了 |
| `Stream ended without finish_reason` | 5 | SSE 流被上游提前关闭 |
| `terminated` | 3 | 同上 |
| `Request was aborted` / `This operation was aborted` | 8 | 用户/程序中断 |
| `429 Rate limit` / `403 RegionError` / `404 not_found` / `400 invalid argument` / `500 Internal server error` | 各 1–5 | 提供方/账号侧 |

**这里有一个观测盲区**：`usage` 只在响应正常收尾时才有，所以这些错误记录的 prompt 大小不可知 —— **其中一部分很可能是"超窗后被网关直接切断"而不是返回 `finish_reason=length`**。也就是说：现象分两种（截断 / 掐流），但触发条件可能是同一个（prompt 过大），只是上游在不同阈值/时刻选了不同的失败方式。要彻底分开，只能在请求侧记录**发送前的 prompt 估算**（见 8.5 建议）。

### 8.4 结构性隐患：孤儿 toolCall

扫描发现两处「assistant 声明了 toolCall，但对应的 `tool/result` 从未落盘」：

- `8eb0ec8e`：3 处（seq 44 / 48 / 52，均在被 abort 的轮次里）
- `ea268315`：1 处（seq 90）

成因是工具执行途中被 abort/withdraw，助手消息带 `toolCall` 落了盘、结果没回来。这类会话继续对话时，请求里会带一个悬空的 tool_call。这类结构**可能**被上游判成非法参数（`400 invalid argument` 在 `8c8da76c` 上出现过 2 次）或产生退化输出。压缩路径有 `sanitizeToolCallPairs` 兜着，但**正常发送路径没有清理**。建议：送请求前统一过一遍"悬空 toolCall 补桩/剔除"，并加测试。

### 8.5 由此追加的两个小项

- **P1-4 记录请求侧 prompt 估算**：`assistant/message` 落盘时附 `promptEstimate`（发送前 `readCurrentTokens` 的估算值），错误轮也有值。这样"掐流"类到底是超窗还是网络抖动，下次能直接判。
- **P1-5 送请求前清理悬空 toolCall**：复用 `sanitizeToolCallPairs` 的思路，在 `agent-assembly` / 调用前对 `agent.state.messages` 做一次配平（补一条 `toolResult` 或剔除该 toolCall），避免把结构性非法消息发给上游。

### 8.6 关于 custom-go 的补充说明（口径更正）

用户澄清：**`custom-go` 实际上就是 opencode go**（因为内置模型列表不自动更新，所以另建了一条 custom 提供方来调用新模型）。这解释了为什么它和内置 `opencode-go` 指向同一个网关、行为却不同：custom 提供方的模型元数据是本地手填的（`CUSTOM_PROVIDER_DEFAULTS`：contextWindow / maxTokens 都取 131,072），而内置 provider 的元数据来自 pi-ai 模型目录（更接近真实值）。**P1-1 因此更值得做**：同一个网关下，内置模型 180k 正常、custom 模型 125k 就退化，元数据差异是唯一显性区别。

### 8.7 追加复核（2026-09-22 凌晨）：阈值不是固定值，压缩后 89.9k 也会中招

新查两条会话（都在 `assistant-acb0db`）：

**`f1c10679`（09-22 00:06–00:25，就是用户报的那条）**

| 时间 | seq | in | cacheRead | total | out | 结果 |
|---|---|---|---|---|---|---|
| 00:09:45 | 31 | 24,364 | 100,864 | 125,228 | 4,484 | 正常 |
| 00:20:05 | 33 | 4,649 | 125,184 | **129,833** | 1 | 空回（length） |
| 00:21:41 | 37 | 48 | 129,792 | 129,840 | 1 | 空回（「你啥意思啊又空白回复」之后） |
| 00:25:12 | 41 | 154 | 129,792 | 129,946 | 1 | 空回 |

- 又是**单轮爆**：一条用户消息（整理欢迎页）→ agent 读 index.html(38KB) + 19KB skill + search_content(32.8KB) → 从 22.9k 冲到 129.8k。
- **全程 0 次 compaction**：assistant 轮 10 ≤ 40、用户消息 1 ≤ 20 → 被 `promptCount <= 20 && turnCount <= 40` 挡住，而 tokens 早在 seq=31 就过了 `0.75 × 131,072 = 98,304`。**这是 P0-2 护栏 bug 的第二个直接实证。**

**`8d9b2e09`（09-21 23:16–09-22 00:00）**

| 时间 | seq | in | cacheRead | total | out | 结果 |
|---|---|---|---|---|---|---|
| 23:47:43 | 117 | 706 | 124,672 | 125,378 | 945 | 正常 |
| 23:48:02 | 119 | 1,047 | 125,312 | 126,359 | 640 | `length`，**但有 923 字正文**（写一半被截断） |
| — | 121 | | | | | compaction（`digestSource: mechanical`，摘要仅 1,052 字） |
| 00:00:47 | 124 | 66,963 | 22,912 | **89,875** | 1 | 空回 |

两个新结论：

1. **阈值不是固定 token 数。** 压缩后 89,875 就空回，而 12 分钟前 126,359 还能出 640 tokens；同样地 `00a5fa81` 里缓存命中的 184,605 失败，可 09-20 峰值 211,067 却成功。**同一 provider 在不同请求上的可用窗口并不一致**（后端路由/负载相关，从本机无法观测）。→ 只靠 `CUSTOM_PROVIDER_DEFAULTS.contextWindow` 填一个固定值解决不了（P1-1 需改口径），**必须靠 P0-3 把"实测溢出点"动态记下来当本会话可用窗口**。
2. **压缩路径自身也会溢出。** `digestSource: mechanical` 说明 LLM 摘要那一次调用返回了 null（它要把整段 126k 对话发给模型，同样超窗）→ 退化成 1KB 机械摘要。也就是说：溢出时连"总结"都会失败，只能机械兜底（好在那次兜底把上下文砍到了 89.9k）。P0-3 若强制压缩，必须接受"摘要失败 → 机械摘要"这条路径，并保证压缩后仍做一次可容纳性校验。
3. 顺带确认 **P0-1 的判据要写准**：seq=119 是 `length` 但**有正文**（用户看到的是一段没写完的话），不能一律判错；只有"`length` 且既无 text 也无 toolCall"才算退化轮（`isTruncatedTurn` 的现有判据正确，保持）。
4. **P1-4 升级为 P0**：这次 8d9b2e09 的出错轮 `usage` 是有的（89,875），但 09-21 那批 `Connection error.` 的 `error` 轮 `usage` 全丢（prompt 无法获知）。要让"到底是超窗还是网络抖动"可判定，必须在**发送前**把 prompt 估算落盘。

### 8.8 第三类触发源：单条工具结果撑爆（2026-09-22 用户新报 `a17679be`）

用户反馈"这只是个小任务，也读了一半就卡住"。查 `a17679be-9c7e-4d1e-9c09-d02aa219d801`（`assistant-acb0db`，标题为 null，`status=active`，14 条事件、0 条 message）。

任务是 `将全局快速命令补充到首页+注册为command` —— 3 轮工具调用就结束。逐轮 usage：

| 时间 | seq | in | cacheRead | total | out | 结果 |
|---|---|---|---|---|---|---|
| 13:23:09 | 2 | 22,839 | 0 | 22,962 | 123 | 正常（发起 list_files + read_file） |
| 13:23:14 | 5 | 3,391 | 22,784 | 26,270 | 95 | 正常（读 index.data.json + index.html） |
| 13:23:24 | 8 | — | — | — | 1,776 | 正常（读 AGENTS.md + search + list pages） |
| 13:23:24 | **12** | **206,096** | 45,696 | **251,793** | **1** | **空回（`stopReason:"length"`）** |
| 13:23:37 | 13 | | | | | `turn/end reason:"completed"` ← 静默 |

- seq 12 的 `content` 只有 `[{type:"thinking", thinking:"That"}]`（3 个字符）。`output=1`、`reasoning=1`。
- **一轮从 3.4k 冲到 206k**：seq 10 的 `search_content` 工具结果命中 `IdolProject/IdolProject.card.json:1218` 的 `replaceString`，**单条正文 716,744 字符**（≈717 KB，是卡里内嵌的整张报名表 HTML）；同一轮还读了 `index.html`(40 KB) + `index.data.json`(17.5 KB)。
- `input` 206,096 而 `cacheRead` 仅 45,696 ⇒ **新读入约 16 万 token**，与"717 KB 单条"的量级吻合。

**这一类与前面几类的区别（要单独看）**：

| 类别 | 触发 | 上下文增长方式 |
|---|---|---|
| 8.1 / 8.2 | 长对话累积 | 多轮缓慢堆积 |
| 8.7 | 压缩后仍不够 | 压缩产物 + 残留 |
| **8.8（本类）** | **单条工具结果** | **一次工具返回即顶穿窗口**，与对话长短、任务大小无关 |

也就是说：**这不是"会话太长"，而是"某一次工具返回太大"**。任务本身只有 3 步，玩家感知却完全一样（读一半就没反应）。`search_content` 把索引里所有匹配整段返回，命中一次大字段（HTML 资产、卡 JSON、长文档）就能单独把窗口打爆。

### 8.9 由 8.8 追加的修复项

**P0-5 工具结果硬上限 + 截断标注（本类的主修）**

- `search_content` / `read_file` / `list_files` 的单条结果加上限（**建议 32 KB / 条**，可配），超出即截断并在正文尾部标注 `…（已截断：共 N 字符，显示前 M 字符）`，同时在 `details` 里回传 `truncated: true / totalLength`。
- 命中数也设上限（如 50 条），超出提示"命中过多，请缩小关键词或指定路径"。
- 理由：一条 717 KB 的搜索结果，即使模型窗口 1M，也是纯粹的浪费与噪声来源；截断是最低成本、最有效的止损。

**P0-6 `search_content` 排除大字段 / 降权**

- 索引时跳过或降权明显的资产字段（`replaceString`、`first_mes`、`mes_example`、base64/`data:` 前缀的长串）。这些内容靠 `read_file` + 路径打开更合适，不该由全文检索整段吐出。

**P0-7 渐进式读取（可选，配合 P0-5）**

- 大文件的首次 `read_file` 只回前 N KB + 行数/结构摘要，让 agent 显式续读（`offset` / `limit`）。当前 `read_file` 对 40 KB 的 `index.html` 是整份进入上下文的。

**与既有方案的关系**：P0-1（不静默）与 P0-3（溢出即强制压缩 + 记实测窗口）依旧必要 —— 它们负责"发生时被看见 / 能自愈"；**P0-5/6/7 负责"别让一次工具返回就把窗口打爆"**，是从源头减少发生频率。两者不冲突，都要做。

## 九、代码调研补充（2026-09-26，对照仓库现状）

- `agent-runner.ts`：提案记的 `:498` 已漂移，`persistMiddleware` 现位于 540-570，逻辑与提案一致——551-556 仅 `error` / `aborted` 判失败，其余（含 `length`）一律 `completed`；`appendMessageEvent`（580-583）原样落盘，无 `markTruncated`。`retryLastTurn` 现位于 240-264（提案记 253，门限在 259 行 `stopReason !== "error"` 即抛 `ValidationError`），`withdrawLastTurn` 在 301-323。P0-1 的切入点（`appendMessageEvent` + `persistMiddleware`）准确。
- `context/compaction.ts`：`planCompaction` 93-128，113 行闸门 `if (promptCount <= keepRecentPrompts && turnCount <= maxTurns)` 与提案引用逐字一致；默认值 `thresholdRatio 0.75`（97）、`keepRecentPrompts 20` / `maxTurns 40`（98-99）确认。`CompactionOptions`（12-18）确实无 `hardRatio` / `targetRatio`，P0-2 为新增字段。`estimateTokens` 在同包 `token-estimate.ts` 已存在，可直接 import。
- `capabilities/compaction/transform.ts`（全 80 行）：26 行 `planCompaction(messages, { currentTokens, contextWindow })` 未传任何阈值覆盖，P0-3"阈值降 0 强制压"无现状钩子，需新增。另注意 24 行兜底 `?? 32768`：当模型元数据缺 `contextWindow` 时压缩按 32k 触发，比提案讨论的 131k 更激进，P1-1 改默认值时需同时审这一路，避免双重阈值打架。49-55 行已有"LLM 摘要失败 → `digestSource: mechanical` 兜底"路径，与 8.7 的观察一致。
- `model-providers/catalog.ts`：`CUSTOM_PROVIDER_DEFAULTS` 正在 99-102（`contextWindow: 131072, maxTokens: 131072`），引用精确；133-146 显示自定义模型无显式值时双双取该默认，P1-1 口径（A 保守默认 / B 显式必填）切入点准确。
- 前端引用需更正：`chat-session-reducer.ts:127` 已不存在，现逻辑在 `model/entry-reducer.ts:266`（`stopReason === "error"` 才记错）；`chat-tool-projection.ts:20` 命中精确——`extractMessageText`（20-24）只收 `isTextContent`，`thinking` 块确实被丢弃，P0-4a 前提成立。另附一条：`entry-reducer.ts:334` 对"无文本、无错误、无 toolCall"的消息直接丢弃/合并，空回在 UI 层的"空气泡"有这一层参与，P0-4a 联调时需覆盖。
- `ErrorMessageSection.tsx`（全 75 行）：现有折叠只渲染 `detail` 文本 + 可选 auth 设置入口/重试按钮（ props 仅 `error / errorCode / onRetry`），无诊断字段、无复制按钮，P0-4b 为纯新增。`entry.ts:48` 的 `stopReason?: string` 与 contracts `websocket.ts:88-98` 的 `turn/end.reason ∈ {completed, aborted, error}` 确认"不新增 `truncated`"的取舍成立——新 reason 要动 schema + WS 校验 + reducer + i18n。
- 上游机制部分成立：pi-ai `simple-options.js` 确有共享预算机制（`MIN_ANSWER_TOKENS = 1024`、`clampThinkingBudgetToAnswerRoom`、`adjustMaxTokensForThinking`），`openai-completions.js:390` 保留 `rawStopReason`；但提案记的 `openai-completions.js:737-740` 为旧版本行号，现文件仅 400 余行，对应逻辑已迁移到 `simple-options.js`，实现前按现版本重对一遍行号。
- `token-estimate.ts:85-90`：`readCurrentTokens` 优先取最近 `usage.totalTokens`，否则本地估算（CJK 按 1.5 字符/token、英文按 4 字符/token）。错误轮 `usage` 缺失时只能走估算——这正是 P1-4（发送前估算落盘）要补的缺口，现状确认无该字段。
- 未完全复核：P1-5"正常发送路径无悬空 toolCall 清理"——`sanitizeToolCallPairs`（`compaction.ts:179-211`）现状仅被压缩路径（`transform.ts:33`）调用，`agent-assembly` 侧是否调用本次未展开，实现 P1-5 前需先 grep 确认调用点，避免重复清洗。

## 九、修复方案（2026-09-26 定稿；工具结果上限归 09-22 篇，不在这里做）

范围：P0-1 / P0-2 / P0-3 / P0-4 + P1-4（发送前 prompt 估算落盘）。不做：改 `CUSTOM_PROVIDER_DEFAULTS`、手动 `/compact`、悬空 toolCall 清理、contracts 新 reason。

### P0-1 退化轮记失败

- 新文件 `packages/core/src/context/truncated-turn.ts`：`isTruncatedTurn` / `markTruncated`（`stopReason → error`，保留 `rawStopReason`，写 `errorMessage`，判据以 §8.7 为准：`length` 且既无 text 也无 toolCall）；
- `agent-runner.ts` `appendMessageEvent`：落盘前 `markTruncated`；顺带写入发送前 `promptEstimate`（turn 开始时 `readCurrentTokens` 快照，stamp 在 message 上；`assistantMessage` 是 `Type.Unknown()`，contracts 不用改）；
- `persistMiddleware`：对最后一条 assistant 先 `markTruncated` 再判 reason；
- `retryLastTurn` 改为从 eventLog 末条 assistant 判 reason（现读内存缓冲末条仍是 `length`，点重试会抛 `ValidationError`，P0-1「可重试」否则不成立）；
- `length` 且带 toolCall 的轮次判据不变，归 09-23 A 类计数覆盖（截断 fail 路径不经过 `beforeToolCall`，只在那边计数才不漏），本篇不重复实现。

### P0-2 `planCompaction`

- `CompactionOptions` 加 `hardRatio`（默认 0.9）、`targetRatio`（默认 0.5）；
- `overHard`（`currentTokens > contextWindow * hardRatio`）时绕过 `promptCount <= keep && turnCount <= maxTurns` 闸门，从 `keep` 递减直到 `estimateTokens(tail) <= window * targetRatio`，否则 `keep = 1`；
- P0-3 依赖本节先落地（`thresholdRatio: 0, hardRatio: 0` 要靠硬阈值分支绕过 keep 窗口）。

### P0-3 `maybeCompactLog`

- 末条 `isTruncatedTurn` → `thresholdRatio: 0, hardRatio: 0` 强制压一次；
- 实测窗口：有 usage 时取 `min(配置值, last.usage.totalTokens * 0.9)` 记为本会话可用窗口，存 runner 内 `observedWindow` 字段（单 runner 即单会话；restore 时从最后截断轮 usage 重算）；优先级高于 `agent.state.model.contextWindow`（含 `?? 32768` 兜底）；
- 压完若 `postEstimate > observed * targetRatio`，再 plan 一次 `keep = 1`；接受 mechanical digest（`digestSource: mechanical`）。

### P0-4 前端（design 原记的 `ChatMessage` / `MessageItem` 已不存在，以现状为准）

- `AssistantEntry` 加 `_thinking?` / `_thinkingTruncated?` / `_diagnostics?`；
- 新增 `extractMessageThinking`；`entry-reducer`（live）与 `history-entries` / `persisted-entries`（历史恢复）两路都写入，重开页面诊断不消失；
- `entry-reducer.ts:334`「空消息丢弃」：有 thinking 的截断轮显式豁免，否则仍渲染空气泡；
- `AssistantBubble` 折叠思考块；`ErrorMessageSection` 补诊断字段 + 复制按钮；
- i18n：`chat.thinking.*` / `chat.error.detail.*`（加载 i18n skill）。

测试：`agent-runner*.test.ts`（`length` + 空 content → `turn/end error` + 可 retry；`length` + 有 text 不改）；`compaction.test.ts`（短会话 + tokens > 0.9w → `shouldCompact`）；`capabilities/compaction.test.ts`（末条空回即使 tokens < 0.75w 也 applied）；app 侧 thinking 投影、截断标、诊断可复制。

验证：`npm test --workspace=packages/core`；`npm test --workspace=packages/app`；P0-4 后 `npm run typecheck --workspace=packages/app`。


