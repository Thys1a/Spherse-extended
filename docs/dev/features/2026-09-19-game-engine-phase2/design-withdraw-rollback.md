# 撤回消息时回滚当轮修改 — 方案设计（仅调研，未实施）

- 日期：2026-11-01
- 来源：用户验收期望——点“撤回”时把那一轮的数据/卡片修改一起回滚，而非仅截断消息。
- 状态：语义三决策已定（见 §一），**本次不做实现**，只留设计供后续排期。

## 一、已决策语义

1. **冲突（文件在该轮之后又被改过）**：跳过该文件并告知，消息照常撤回，能回滚的照常回滚，绝不强写。
2. **结果呈现**：`turn_withdrawn` 扩展计数字段，前端 toast 显示（如“已回滚 2 处，1 处需手动处理”）。
3. **不可回滚项**（文件写入、记忆、trigger 等）：聊天框内小字显示、可展开的回滚明细；静默跳过执行，不阻断撤回。

## 二、现状

- 撤回链：`WithdrawButton`（两击确认）→ WS `withdraw` → `chat-channel.ts:127` → `sessionManager.withdrawLastTurn`（`session-manager.ts:148`）→ `agentRunner.withdrawLastTurn`（`agent-runner.ts:413`，仅 `append("turn/withdrawn")` + 截断投影）→ log 监听广播 `turn_withdrawn{seq}`（projector `chat-wire-projector.ts:71`，reducer `entry-reducer.ts:120` 截断）。
- 回滚链：`rollback_turn` 工具（`capabilities/rollback/tools.ts`）经 `deps.stores` 的 `TurnSideEffectSource` 取引用，`rollbackRef` 逐条逆序执行（版本链 `producedVersions`、幂等键、冲突转 skipped、写前 `assertWrite`）。
- 关键缺口：`RuntimeDeps`（`session/runtime.ts:54`）**没有** `dataStore`/`cardStore`——它们只活在 `ProjectRuntime`（`factory.ts:162-164`）和 rollback capability 自有实例里。因此 `AgentRunner` 今天够不着执行回滚所需的 store。
- 版本校验是内容哈希比对，任意 store 实例均可执行；但写锁必须是同一 `FileWriteMutex`（`deps` 里有），否则跨实例并发写撕裂。

## 三、可行性：可行，推荐装配点注入

- `factory.ts` 的 `createRuntimeDeps` 调用处把现成的 `dataStore`/`cardStore` 以可选字段透传进 `RuntimeDeps`（装配点本来就持有这两份单例，符合 single-assembly 原则；不建议从 capability 实例里抠——`Capability` 接口无 store 出口，那样才是开洞）。
- `tools.ts` 的 `rollbackRef` 循环提为共享 helper（参数：refs + stores + sessionId + 幂等前缀），`rollback_turn` 工具与 `withdrawLastTurn` 共用，前者行为零变化。
- `withdrawLastTurn` 内顺序：先按 `lastUserEvent.seq` 取 refs → 执行回滚 → 再 `append("turn/withdrawn", { seq, rollback: { undone[], skipped[], failed[] } })`。
- 回滚写入不挂归因（撤回是终态，无所属 turn；幂等键用 `withdraw:<seq>:<refIndex>` 前缀防重入）。
- `read_file`-style 的 policy 检查保留（与工具一致：`assertWrite` 不过即 failed，进明细不阻断撤回）。

## 四、影响面（实施时文件清单）

- core：`session/runtime.ts`（deps 加两可选字段）、`factory.ts`（透传）、`session/agent-runner.ts`（withdraw 内调共享 helper 并扩展事件 data）、`capabilities/rollback/tools.ts`（提 helper，行为不变）。
- contracts：wire `turn_withdrawn` 加可选计数字段（`{seq}` 保持兼容）。
- server：`chat-wire-projector.ts` 映射新字段；`chat-channel.ts` 不动（广播走 log 监听）。
- app：`entry-reducer.ts` 存明细；聊天气泡下小字可展开明细行（复用 `AssistantBubble` 的 `<details>` 折叠源码模式）；冲突/失败时 toast。
- 测试：agent-runner withdraw 回滚用例（含冲突跳过、幂等、空 refs 静默）、rollback helper 回归既有用例、projector/reducer 新字段用例。
- 文档：`data-conventions.md` 撤回节补“附带回滚”一句；本目录 plan 补 Task（未建）。

## 五、已知边界（实施前须接受）

- 仅末轮可撤（现有 UI 即如此，不扩展）。
- 已 compact 的轮次仍不可撤（现有校验保留）。
- 回滚明细只覆盖 data/card；文件/记忆/trigger 永远是“跳过”，明细里如实列出但不可执行。
- 跨 session 写入、SDK 直写归因缺口（backlog 第 61 条）同样适用于此处——那些写入本来就不在索引里。
