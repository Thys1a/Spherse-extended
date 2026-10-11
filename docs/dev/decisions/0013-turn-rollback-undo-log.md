# ADR-0013：turn 级回滚走 undo 日志 + 版本守卫

- 状态：accepted
- 日期：2026-09-23
- 影响：`packages/core`（`tool-attribution.ts`、`capabilities/data/`、`capabilities/card/`、`capabilities/rollback/`、`session/`、`trigger/`）、`packages/contracts`（`websocket.ts`、`data.ts`）、`packages/server`（`routes/data.ts`）、`packages/app`（`ui-sdk/handlers/data.ts`）、`docs/official/architecture/capabilities.md`、`docs/official/glossary.md`

## 背景

R2.5b 要求显式撤销某 turn 的 data/card 写入。全文件快照在 20MB 上限下不可接受；事件日志只有 `tool/result` 的归因引用，无写入前镜像；SDK 直写无 turn 上下文。

## 决策

- **undo 日志而非快照**：store 落库时捕获 op/path/before/after（数组位置记 index），经 tool 结果 details 进 `SideEffectRef.undo` 持久化，`rollback_turn{turnSeq}` 按 turn 逆序恢复。
- **版本守卫 + toolCallId 级幂等**：恢复前校验文件版本，不等即拒绝转人工；同一工具调用重试命中幂等缓存；回滚写自带双向 undo 记录，可再回滚。
- **SDK 写首版不可回滚**：归因 plumbing（contracts 请求体 + routes 转发 + docked 卡片挂 sessionId）已就位，但发现面为 turn/tool-result，合成 `tool/result` 会污染 fold/LLM 上下文，另建旁路日志则机制翻倍——首版排除，与 write/edit/memory/trigger 同列，待独立发现机制。
- **回滚 capability 经 stores registry 桥接**：`SessionManager` 自注册 side-effect 源，rollback capability 在 `tools(host)` 时读取；零内核改动（`SessionPort`/`ToolHost` 不动）。
- **遗留三件套**：busy-defer（turn-end 重放一次）、早失败 synthetic `sp:turn-end{reason:error}`（无 turn/end 才补发）、restore per-session init memo。

## 后果

- 正：回滚 bounded（单写作用域镜像）、冲突 fail-closed、可重试安全；同会话 trigger 订阅可用（defer 后转 end 触发）。
- 负：SDK/旁路写回滚缺席；remove 恢复按 index 回填保序；大叶 set 的 before 镜像按写作用域全量。

## 原始记录

- `docs/dev/features/2026-09-19-game-engine-phase2/plan.md`（T7 实现）

