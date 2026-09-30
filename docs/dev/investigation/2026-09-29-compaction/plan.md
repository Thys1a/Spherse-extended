# 实施计划：截停自动 retry + 工具结果三层防御

依据：`solutions.md`（已修正版）。范围：方案 A（含摘要质量修）+ 工具结果 L1/L2。
B（预检）、L3、C 不在本次范围。

## A. 截停后自动 retry（`packages/core`）✅ 2026-09-30 已实施

- [x] A1 `agent-runner.ts` · `persistMiddleware`：截停轮（`markTruncated` 后
  `stopReason==error && rawStopReason==length`）不落 `turn/end`，改为从
  `eventLog.events` 反查末条 `assistant/message` seq，落
  `turn/retried{abandonedSeqs} + turn/start`，置 `needsAutoRetry = true`
- [x] A2 同文件 · `sendMessage`/`retryLastTurn`：`applyAfterTurnHooks()` 之后、
  `finally` 之前检查并 `agent.continue()` + 再跑一次 afterTurn；`autoRetryCount`
  入口清零、上限 1；失败转 `turn/end: error` + `sp:turn-end`
- [x] A3 新增字段 `needsAutoRetry/autoRetryCount`
- [x] A4 摘要质量修：`sanitizeToolCallPairs` 保留 error 轮（含 error 标记），仅剔除
  无父 toolCall 的 `toolResult`；`buildSummaryInstruction` 加“最近未完成任务精确保留”条
- [x] A5 测试：截停→自动续成功；二次截停→error 不再试；非截停路径不受影响；
  sanitize 新旧用例更新（`agent-runner.test.ts` 新增 describe、
  `context/compaction.test.ts`、`capabilities/compaction.test.ts`）

## L1. 工具输出源头封顶（`packages/core`）✅ 2026-09-30 已实施

- [x] L1-0 `tools/output-limits.ts`：新增通用 `truncateText`（总量上限 + 截断标注）
- [x] L1-1 `read_file`：加 `offset/limit` 参数 + 32KB 上限 + `details.truncated/totalLength`
 （对应关闭 backlog「`read_file` 渐进式读取」条）
- [x] L1-2 `read_card` entry/many、`list_files`、`load_skill` 接入上限；
  `run_command` 100KB → 32KB
- [x] L1-3 各工具单测更新/新增

## L2. 统一兜底 projector（`packages/core`）✅ 2026-09-30 已实施

- [x] L2-1 新增 `capabilities/tool-output-budget/`：`contextProjector` 对每条
  `toolResult` text 做 32KB 截断 + 标注（覆盖 MCP/未来工具；不改落库）
- [x] L2-2 `factory.ts` `defaultCapabilities` 注册；单测
- [x] 文档同步：`project-structure.md` 树 + `architecture/capabilities.md` 表 +
  `architecture/core.md` 截停自愈条（backlog 渐进式读取条已删）

## 方案 B：预检压缩 ✅ 2026-09-30 已实施（同分支后续 commit）

- [x] 改动 4：`compactionCapability` 暴露 `preTurnCompaction`（`windows: Map<sessionId>` 会话级共享；
  `PreTurnCompaction` 类型落户 `kernel/turn-hooks.ts`，`Capability` 接口不动）
- [x] 改动 5：`AgentRunner.maybePreCompact`（`append user` 前调用，含新消息估算，
  `PRE_TURN_COMPACTION_RATIO = 0.75`）+ `compactedThisTurn` 标志
- [x] 改动 6：`factory.ts` 按名取 compaction capability 注入；`createRuntimeDeps` 输入扩展
- [x] 改动 7：`applyAfterTurnHooks` 见标志跳过本轮
- [x] 测试：预检先于 user 落盘且无重复 user；预检失败不阻塞；标志跳过；学习窗口复用
- [x] 文档同步：`architecture/core.md` 预检条 + solutions 实施注记

## 收尾

- [ ] `npm run verify` 相关子集（lint/build/typecheck/core 测试）
- [ ] doc-sync 自查 → commit → code-review skill 审查
