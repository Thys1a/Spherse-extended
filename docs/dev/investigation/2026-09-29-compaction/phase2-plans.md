# 二期实施方案：手动压缩入口 / L3 / P0-6

时间：2026-09-30
依据：`phase2-research.md`（代码现状与方案有无判定）。
状态：**已实施**（2026-09-30，同分支后续 commits；L3 → 手动入口 → P0-6 3a 顺序）。

## 1. 手动压缩入口（预算 4h）

### core 层（`packages/core`，1.5h）

1. `PreTurnCompaction`（`kernel/turn-hooks.ts`）加可选参数：
   `(eventLog, agent, sessionId, options?: { force?: boolean })`；
   `compactionCapability`（`capabilities/compaction/index.ts`）透传给
   `maybeCompactLog`，`force` 同时压 `thresholdRatio/hardRatio → 0` 与
   `keepRecentPrompts/maxTurns → 1–3`（只归零阈值不够，
   `planCompaction` 的 20 prompt/40 turn 守卫会静默 no-op）。
2. `maybeCompactLog` 返回 `{ applied: boolean; digestSource?: "llm" | "mechanical" }`
  （供 UI 反馈；无事可压时 `applied: false`）。
3. `AgentRunner` 新增 public 方法 `compactNow()`：`ensureNotBusy`（turn 进行中拒绝，
   与 `withdrawLastTurn` 同口径）→ 调 `deps.preTurnCompaction(eventLog, agent, sessionId, { force: true })` →
   有新增事件则 `syncBufferFromLog()` → 返回结果。
4. `SessionManager` 加 `compactSession(sessionId)`，仿 `withdrawLastTurn` 委派
   （runner 不存在抛 `NotFoundError`）。
5. `RuntimeDeps` 与 factory 无需改（`preTurnCompaction` 已有；第三方替换掉
   compaction 时按名查找失败则不注入，`compactSession` 抛 `NotFoundError`）。

### contracts 层（`packages/contracts`，含 server 共 1h）

client → server 新增 `{ type: 'compact' }`（WS URL 已含 sessionId，不带冗余字段）；
server 回 ack：**已决（2026-09-30）——采用前者**：把 `compaction/applied` 投影到
live（`ChatWireProjector` 新增 case），replay/live 同词汇，与 backlog 事实流统一
方向一致；`{ type: 'compact_result' }` 方案弃用（live/replay 双词汇，留技术债）。

### app 层（`packages/app`，1.5h）

ChatPanel 工具栏加"压缩上下文"按钮（streaming/inactive 时禁用；busy 时 server 拒绝
→ toast 提示"对话进行中"；`applied: false` 时 toast"无需压缩"）；或 `MessageInput`
识别 `/compact`——注意 `slash-menu.ts` 的 `TOKEN_RE` 只认 `/skill:`/`/command:`，
需单开本地命令分支拦截（不进 `expandSlashMessage`）。

### 验收测试

- busy 时 `compactSession` 拒绝；空会话返回 `applied: false` 无事件追加。
- 20 prompt/40 turn 内会话点压缩仍生效（force 旁路守卫）。
- live 收到压缩反馈事件（任选其一实现）。

## 2. L3 wire 视图版（预算 2h）

### 已决四点（2026-09-30 review 修正）

1. **位点**：复用现有 `tool-output-budget` capability，追加第二个 `contextProjector`
   （省新目录 + factory 行 + official 文档表行；只改 wire 不动落库）。
2. **轮切分**：按 `user` 消息切段（"assistant 含 toolUse 为轮起点"不可靠——同轮可有
   多个 assistant、可无 toolUse）；仅对"倒数第 N 段之前"段内的 `toolResult.content`
   换占位。
3. **占位与阈值**：占位 `[Output from ${toolName} - 原始 ${byteLength} bytes]`
   （保留 `isError`/type）；N = 5（轮数口径——单轮可含多个 32KB 结果，
   如需更紧可再加字节上限，本次不做）。
4. **交互**：与 `excludedSeqs`/digest 无交互（projector 在 fold 之后，
   已跳过 excluded/compacted 部分）；`summarizeForCompaction` 与 `getTurnContext`
   同走 `convertToLlm`，输入同步受益（非副作用，是收益）。

### 实施（capability 内追加 + 单测）

1. `capabilities/tool-output-budget/` 新增 `pruning-projector.ts`，
   在 `index.ts` 的 `contextProjectors` 数组追加（排 `toolOutputBudgetProjector` 之后）。
2. 当前轮（最近段）绝不剪——天然成立（只剪倒数第 N 段之前），单测锁定。

### 测试（6 单测）

单轮 / 多轮（N 段外被剪、N 段内保留）/ error 保留 / N=0 边界 /
与 compaction 共存（digest + tail 下正常计数）/ MCP 工具。

## 3. P0-6 扫描时跳过

### 3a. `search_content` 大文件 fast-path（预算 1h，必做；review 修正）

`searchInFile` 开头加 `fs.statSync` 取 `size`，超阈值则跳过该文件**并上报**：
`details.skippedLargeFiles` 计数（+ 前几个文件名），正文可选提示"X 个大文件已跳过"。
阈值默认 1MB（512KB 会误伤合法大文本；或做成工具可选参数，本次先硬编码）。
含测试（跳过计数可见 + 小文件不受影响）。

### 3b. `search_card` 字段跳过表（可选，性价比低）

`searchEntries` 加可选参数 `excludeFields?: string[]`，扫描前过滤
`entry[field]`（如 `replaceString`）；`search_card` 工具不暴露该参数
（内部硬编码或默认空）。因 card content 默认不搜（`fields: ['keys', 'comment']`）
且 snippet 已 capped + L2 兜底，**已决（2026-09-30）：不做**，只做 3a。
