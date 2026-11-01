# rollback_turn 深度调查（2026-11-01）

## 一、机制（代码实证）

- **入口**：`core/src/capabilities/rollback/tools.ts:35`，参数仅 `turnSeq`（turn/start seq）；能力 id `rollback`，随 `defaultCapabilities` 常驻装配（`builtin.ts:32`）。
- **索引**：`SessionManager` 在 stores 注册 `TurnSideEffectSource`（`session-manager.ts:26-30`），按 `turn/start` 事件切分区间，从 `tool/result` 的 `sideEffects` 读引用；live 会话读内存事件，离线读持久化事件。
- **归因链**：`deriveSideEffects`（`tool-attribution.ts:115`）从 tool details 提取 `{type, file, version, undo}`；`mutate_data`/`edit_card` 带 undo 记录，`write/edit_file`、`memory`、`trigger` 等只有引用无 undo——工具内天然跳过，与描述“仅 data/card 可回滚”一致。
- **执行语义**：同文件多写按“从新到旧”逆序；`producedVersions` 链式传递版本号，同 turn 内自洽；`rollback:${toolCallId}:${refIndex}` 幂等键；版本冲突转人工、永不强写；写前过 `assertWrite`；256KB 以上 undo 镜像丢弃但不阻塞原写。
- **回滚本身可再回滚**：逆操作落库带 `dual` undo，且本次回滚写入同样携带归因进入当轮索引；append-only 未被破坏（无事件篡改，只是当轮的一次普通工具调用）。
- **SDK 前置已通**：`server/routes/data.ts:98-138` 三处透传 `sessionId/toolCallId`。
- **测试**：`__tests__/rollback-turn.test.ts` 22/22 通过（2026-11-01 实跑）。
- **文档**：`data-conventions.md` turn 归因节与实现一致，无需动作。

## 二、缺口（按重要性）

1. **SDK 直写归因仍不完整**（backlog 跟踪中）：docked 卡片 sessionId、跨 session 写入、SDK 写入入 session log 均未完成 → 这些写入对 `rollback_turn` 不可见。
2. **UI 无开关**：`rollback_turn` 在 `packages/app/src` 零命中，Agent Dialog 工具 picker 里没有它；装配侧按 `profile.tools` 白名单过滤（`agent-assembly.ts:168-171`），UI 永远配不出来，只能手写 profile 或经 `manage_agent`（`validateTools` 对全量 toolCatalog 校验，可通过）开启。待确认是有意隐藏还是遗漏。
3. **`memory`/`trigger` 引用计入索引但永远 skipped**：`listTurnSeqsWithSideEffects` 把它们算作“有副作用的 turn”，`Known turns...` 提示可能误导模型；cosmetic。
4. **无审批门**：未包 `withApproval`，与 `manage_agent`/`run_command` 口径不一致；backlog 第 59 条第③项有相邻记账，可一并决策。

## 三、为什么使用中感知不到（另见 §四手工验证）

1. 默认 agent 的 `tools` 为空，且 picker 里根本没有该工具 → 绝大多数会话里它不存在。
2. 即使配了，常见 turn（读写文件、记忆、触发器）零可回滚引用，调了也只会回“No recorded side effects”。
3. 模型不知道 turnSeq（prompt 里不带轮号；只有调错一次后才能从 `Known turns...` 提示里看到）。
4. 成功也是静默的：无 UI 卡片、无专属会话事件，结果只是一行 tool 文本。

## 四、手工验证方法（无需改代码）

1. 用 `manage_agent update` 给某 agent 的 `tools` 加上 `rollback_turn`、`mutate_data`、`read_data`（需审批通过）。
2. 新会话第一轮：让它用 `mutate_data` 往一个有 `$manifest` 的 `.data.json` 写一条测试记录（或用 `edit_card` 改一条世界书条目）。
3. 第二轮：让它调 `rollback_turn`，`turnSeq` 先随便填（如 0）→ 返回 `Known turns with side effects: [...]` → 用正确 seq 再调一次。
4. 预期：`1 undone, 0 skipped, 0 failed`，再 `read_data`/`read_card` 确认值已恢复；重复调同一次（同 toolCallId+refIndex 幂等）应直接返回缓存结果。
