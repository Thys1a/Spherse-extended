# worldbook 注入位置修正

- 日期：2026-10-12
- 状态：已立项，待方案
- 版本：v1.0.3（独立条目；与状态数据外链同批，共用「插到当前用户消息之前」helper）
- 来源：`docs/dev/investigation/2026-10-06-cross-project/06-tavern-vs-agent.md` §四 / §五（拟定 v1.0.x，两条 worldbook 提案之一）

## 范围

把 `<worldbook>` 从「队尾 user（当前用户消息之后）」挪到「当前用户消息之前」，真实输入仍居末位（近因）* 、世界书作前导语境；role 仍 `user`* 、仍 wire-only，仅改插入点。目录*

## 关联

- 现状代码：`packages/core/src/capabilities/card/worldbook.ts:340-349`（`[...messages, worldbook]`）
- 同批：状态数据外链（`../2026-10-11-state-data-link/`，共用 helper）、扩大 worldbook 注入（`../2026-10-12-worldbook-budget/`）
