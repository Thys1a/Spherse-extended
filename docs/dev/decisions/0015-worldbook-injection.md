# ADR-0015：worldbook 以队尾 user 块注入、selective 取 AND、缓存取指纹轮询

- 状态：accepted
- 日期：2026-09-19
- 影响：`packages/core`（`capabilities/card/worldbook.ts`、`capabilities/card/parser.ts`）、`docs/official/architecture/capabilities.md`、`docs/official/glossary.md`

## 背景

worldbook 是首个逐轮读盘的 capability，但 `ContextProjector` 为同步签名、不可异步读文件；`CardStore.walkCardFiles` 跳过 `.spherse` 使其 `onChange` 对 agent 卡永不触发；ST selective 语义（primary AND secondary）在本仓无本地定义。

## 决策

- **队尾 user 块载体**：命中条目以独立 user 消息追加于 fold 后 messages 之末（skill-catalog 之后），`position` 首版忽略；上轮注入块在扫描前剥离，阻断自反馈续注
- **selective 取 ST AND 语义**：primary（keys）与 secondary（secondary_keys）必须同时命中，任一为空恒不触发
- **缓存取指纹轮询**：lazy 同步加载 + 逐轮复核（目录 mtime + 各卡文件 mtime/size），不做分支初始化预载/fs-watch；`invalidateWorldbookCache` 仅作显式入口
- **预算取双上限 + 首条保留**：条目 ≤8、总量 ≤2k tokens 起步可调，内部按 `insertion_order` 排序后截断；首个命中条目恒保留（单条超限时总量声明为例外）

## 后果

- 正：projector 零异步、零外部订阅；AND 语义避免 secondary 短词误触；指纹覆盖编辑器原地改写
- 负：同毫秒同大小改写可能漏检；队尾 user 块是否被模型降权待真机验证（见 `docs/dev/investigation/worldbook-order-tuning.md` 待验证项 4）

## 原始记录

- `docs/dev/features/2026-09-17-game-engine/plan.md`（T14/T15 实现注记）
