# 扩大 worldbook 注入

- 日期：2026-10-12
- 状态：已立项，待方案
- 版本：v1.0.3
- 来源：`docs/dev/investigation/2026-10-06-cross-project/06-tavern-vs-agent.md` §四（拟定 v1.0.x，两条 worldbook 提案之二）

## 范围

取消当前 `WORLDBOOK_MAX_ENTRIES=8` / `WORLDBOOK_MAX_TOKENS=2000` 的每轮注入预算上限，按需放开或改为可配。

## 关联

- 现状代码：`packages/core/src/capabilities/card/worldbook.ts:15-16`
- 先评估 token 占比与指令遵循，参考 `docs/dev/investigation/worldbook-order-tuning.md` 待验项
- 同批：worldbook 注入位置修正（`../2026-10-12-worldbook-position/`）
