# ADR-0016：worldbook 取消预算上限、数字插入点 0–4

- 状态：accepted（接替 ADR-0015 的载体/预算两条）
- 日期：2026-10-21
- 影响：`packages/core`（`capabilities/card/worldbook.ts` 投影分组 + system hook、`parser.ts`、`card-store.ts`、`factory.ts`）、`packages/contracts`（card + agents）、`packages/app`（外链画像）、`docs/official/data-conventions.md`

## 背景

预算数值（8 条 / 2k tokens）从未经真机实测验证；单一队尾 user 位置无法表达 ST 位置语义；system 侧没有动态注入槽位。

## 决策

- **取消预算上限**：命中全量注入，安全阀从硬上限换成可见性（Agent 对话框外链旁单卡常驻 / ≤最坏 token 画像）；profile 级可配预算因成本跳档否决
- **数字插入点 0–4**：0/1 走 systemPrompt（独立 `turnHooks.beforeTurn`，MCP 之前/之后由用户选），2/3/4 走 wire user 消息（projector 按 user 段计数，恒选段首）；旧字符串 position 读时一律归一为 3，`depth` 为独立字段
- **否决**：system-role 消息（pi-ai 无该类型）、assistant 伪装（伪造模型发言）、按 raw 条数计 depth（会拆 `assistant(toolCall) → toolResult` 对子）

## 后果

- 正：位置语义一次到位，无上限后大卡行为可见可调
- 负：system 块每轮重算破坏该段缓存；depth 系相对距离非固定历史点，compaction 后重新锚定（见 tuning doc 待验项）

## 原始记录

- `docs/dev/features/2026-10-12-worldbook-budget/README.md`（§二）与 `plan.md`
- `docs/dev/features/2026-10-12-worldbook-position/design.md` 与 `plan.md`
