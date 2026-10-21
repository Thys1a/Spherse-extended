# worldbook budget plan（取消上限 + token 画像）

用户决策：彻底取消（不做可配）；画像口径按“常驻 / ≤最坏”双值 + 最坏占比；只显示数字不做阈值判断；`applyWorldbookBudget` 删除；`manage_agent` 工具结果不带画像。
先于 position 项执行（position 的分组逻辑依赖“无预算”前提，见 design §六）。

## A：core 取消预算（仅 core 包）

- [x] `worldbook.ts`：删除 `WORLDBOOK_MAX_ENTRIES` / `WORLDBOOK_MAX_TOKENS`（:15-16）、`WorldbookBudget`（:20-23）、`applyWorldbookBudget`（:64-77）
- [x] `worldbookProjector`（:340-349）：`matchWorldbook` 结果直接渲染注入（已按 `insertion_order` 排好序，:55）
- [x] 检查 `card/index.ts` / `core/index.ts` 是否导出被删符号，一并移除（不留悬挂导出）
- [x] 测试：`worldbook.test.ts:110-145` 整段删除预算用例；新增无上限用例（20 条命中全注入、顺序不变）
- [x] verify：`npm test --workspace=packages/core` + `npm run typecheck --workspace=packages/core`

## B：core token 画像（仅 core 包）

- [x] 新增纯函数 `worldbookStats(entries)` 返 `{ entryCount; enabledEntryCount; alwaysTokens; maxTurnTokens }`，口径：逐条 `estimateTokens(renderWorldbookEntry(e))`
- [x] 常驻 = `enabled && constant`；最坏 = 常驻 + 可能命中的 enabled 条目（`selective` 需主副键均非空；普通条目需 keys 非空；无 keys 且非 constant 不计入）
- [x] `AgentCardLink`（`worldbook.ts:227-231`）扩展上述 4 字段；`listAgentCardLinks`（:239）解析 real path 后 `toParsedCard(fs.readFileSync(real))` 填入，`dangling`/解析失败置 0
- [x] 从 `card/index.ts` 导出 `worldbookStats` + 新字段类型
- [x] 测试：常驻/最坏分类、disabled 排除、selective 单边为空、无 keys 排除、CJK 估算；链接用例补新字段断言（dangling 置 0）
- [x] verify：`npm test --workspace=packages/core`

## C：contracts + server

- [x] `contracts/agents.ts:119` `cardLink` 增加 4 个必填 `Type.Number()`（wire 新增字段向后兼容）
- [x] `server/routes/agents.ts:70-83` 零逻辑改动（`parseContract` 自动透传）
- [x] 测试：`server/__tests__/agents-card-links.test.ts` fixture 补 4 字段（schema 必填，否则 parse 失败）
- [x] verify：`npm test --workspace=packages/server`（contracts 有 schema 用例则一并跑）

## D：app 展示 + i18n

- [x] `AgentCardLinksField.tsx`：Badge 改 `target · N 条 · 常驻 X / ≤Y tok`；列表下加汇总 `合计 ≤Y tok（占窗口 Z%）`
- [x] 新增 `contextWindow?: number` prop；`AgentDialogForm.tsx:270` 传入，优先级 `formData.model` → `settings.models.text.defaultModel` → provider catalog（`contracts/settings.ts:10`）；解析不到只显示绝对 token
- [x] app 不重算 token（须与运行时同口径）
- [x] i18n：新增 `agent-dialog.cardLinksTokens` / `cardLinksTotal`（加载 i18n skill，全语言补齐）；`npm run check:i18n`
- [x] 测试：`AgentCardLinksField.test.tsx` 补正常 / dangling / 无 `contextWindow` 三种渲染
- [x] verify：`npm test --workspace=packages/app`

## E：文档收尾

- [x] tuning doc：待验项 #1 保留、#3 改为“用户按画像自拆”
- [x] 本 README 状态改为已完成；`docs/dev/backlog.md` 勾销对应条目
- [x] verify：`npm run verify`

提交：A–E 一笔 commit（`chore:` 前缀；纯 core 行为变更无 schema 迁移）。
