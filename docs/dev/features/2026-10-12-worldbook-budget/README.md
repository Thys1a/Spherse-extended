# 扩大 worldbook 注入

- 日期：2026-10-12
- 状态：已实现（2026-10-21，与 plan.md A–E 一次合入；真机 prompt 实测待补，见 tuning doc 待验项）
- 版本：v1.0.3
- 来源：`docs/dev/investigation/2026-10-06-cross-project/06-tavern-vs-agent.md` §四（拟定 v1.0.x，两条 worldbook 提案之二）

## 范围

取消当前 `WORLDBOOK_MAX_ENTRIES=8` / `WORLDBOOK_MAX_TOKENS=2000` 的每轮注入预算上限（删除，不改可配），并以**可见性替代硬上限**：Agent 编辑框的世界书链接旁展示每卡 token 画像（常驻 / ≤最坏双值 + 最坏占比），只显示数字、不做阈值判断，由用户自行调整。

## 关联

- 现状代码：`packages/core/src/capabilities/card/worldbook.ts:15-16`
- 先评估 token 占比与指令遵循，参考 `docs/dev/investigation/worldbook-order-tuning.md` 待验项
- 同批：worldbook 注入位置修正（`../2026-10-12-worldbook-position/`）

### 1.1 现状（`packages/core/src/capabilities/card/worldbook.ts`）

- 常量 `WORLDBOOK_MAX_ENTRIES = 8` / `WORLDBOOK_MAX_TOKENS = 2000`（:15-16）；`applyWorldbookBudget`（:64-77）逻辑：按 `insertion_order` 排序 → 取前 N → token 累加截断，**首条恒保留**（单条超限时总量声明为例外）。
- 唯一无预算调用点：`worldbookProjector:346`。`WorldbookBudget` 显式覆盖能力保留，无其他调用方（server/app 无引用）。
- Token 口径：`estimateTokens`（与 `getStatus` 同一估算器），对 `renderWorldbook` 渲染后文本整体计量；逐条计量口径为 `estimateTokens(renderWorldbookEntry(entry))`（`worldbook.ts:71`，与预算截断同一累加器）。
- 链接展示链路（token 画像挂载点）：`listAgentCardLinks`（`worldbook.ts:239`，现只返 `{name, target, dangling}`）→ server `GET card-links`（`routes/agents.ts:70-83`，经 contracts `cardLink` schema）→ app `AgentCardLinksField.tsx`（Badge 列表）。模型 `contextWindow` 已在 provider catalog 中（`contracts/settings.ts:10`），`AgentDialogForm` 已 fetch（`:58`），占比可在 app 侧算出，无需新接口。

### 1.2 冲突：调优文档写的是反方向（已决，见 §1.4）

`worldbook-order-tuning.md` 待验项 #3：“若占比超标，优先收紧条目数（8→4），其次收紧 token（2k→1k）”——且**真机 prompt 实测从未执行**，token 占比（目标 <15%）未知。无测量就取消上限 = `constant` 条目 + 大卡每轮全量注入，最坏吃掉整窗。**决议**：取消上限的同时上线 token 画像（§二），把安全阀从硬上限换成可见性；tuning doc 待验项 #1（占比目标 <15%）保留，#3 收紧预案删除，改为“占比超标时由用户按画像自行拆分卡片”。

### 1.3 改动面

- `worldbook.ts`：删除 `WORLDBOOK_MAX_ENTRIES` / `WORLDBOOK_MAX_TOKENS`（:15-16）、`applyWorldbookBudget`（:64-77）、`WorldbookBudget`（:20-23）；`worldbookProjector`（:340-349）直接注入 `matchWorldbook` 全部命中（其 :55 排序即原预算排序，无需保留）。
- `worldbook.test.ts:110-145`：R7.2 整段钉住 8/2000，必须重写——无上限用例（20 条命中全注入、顺序不变）、`worldbookStats` 用例（常驻/最坏分类、disabled 排除、selective 单边为空不计上限、无 keys 非 constant 排除、CJK 估算）、链接用例（正常链接返 4 个新字段、dangling 置 0）。
- tuning doc 待验项 #1/#3 同步（占比目标保留，收紧预案删除或改写，见 §1.2 决议）。

## 二、token 画像方案（可见性替代硬上限）

### 2.1 口径（先定语义）

worldbook 按关键词动态匹配，每轮实际注入量不可静态预知，故展示双值而非单值：

- **常驻 tokens**：`enabled && constant` 条目（每轮必注入）= 下限。
- **最坏 tokens**：常驻 + 所有**可能命中**的 enabled 条目 = 上限。`selective` 需 primary/secondary 均非空；普通条目需 keys 非空；无 keys 且非 constant 的条目永不命中（`matchWorldbook:33-57`），不计入。
- 每轮实际值落在两者之间，取决于最近 10 条消息 / 4000 字符的匹配结果。
- 计量为逐条渲染之和，不含 `<worldbook>` 包裹与条目分隔符（恒定小量偏差，“最坏”恒偏小）。
- 占比 = 最坏 tokens / 模型 `contextWindow`。
- 不做“上一轮实际注入量”（需读某次 session 的 turn-context 快照，跨 session 无意义，成本跳档）。

### 2.2 分层改动

- **core**（`worldbook.ts`）：新增纯函数 `worldbookStats(entries)` 返 `{ entryCount; enabledEntryCount; alwaysTokens; maxTurnTokens }`，复用 `renderWorldbookEntry` + `estimateTokens`（与运行时同一口径）；`AgentCardLink`（:227-231）扩展上述 4 个字段，`listAgentCardLinks`（:239）在解析出 real path 后 `toParsedCard(fs.readFileSync(real))` 填入，`dangling`/解析失败置 0。
- **contracts**（`agents.ts:119`）：`cardLink` 增加 4 个必填 `Type.Number()` 字段，wire 新增字段向后兼容。
- **server**（`routes/agents.ts:70-83`）：零逻辑改动，新字段经 `parseContract` 自动透传。
- **app**（`agent-dialog/`）：`AgentCardLinksField.tsx` Badge 改为 `target · N 条 · 常驻 X / ≤Y tok`，列表下方加汇总行 `合计 ≤Y tok（占窗口 Z%）`；新增 `contextWindow?: number` prop，`AgentDialogForm.tsx:270` 传入（取值优先级 `formData.model` → `settings.models.text.defaultModel` → provider catalog 解析；解析不到只显示绝对 token）。app 侧不重算 token（卡片需读文件，且须与运行时口径一致）。
- **i18n**：新增 `agent-dialog.cardLinksTokens` / `cardLinksTotal` 等 key（实现时加载 i18n skill，三语文案齐补）。

### 2.3 测试

- `server/__tests__/agents-card-links.test.ts`：fixture 补 4 个字段（schema 必填，否则 parse 失败）。
- `app/AgentCardLinksField.test.tsx`：token 文案渲染、dangling、有/无 `contextWindow` 两种分支。

### 2.4 边界与风险

- `listAgentCardLinks` 从“只读 symlink”升级为“读并解析卡片”，只在打开 Agent 编辑框时调用，可接受（卡片有大小上限）。
- 画像是文件级统计，与注入位置（P0/P1/P2/P3b）无关，位置改造不影响本方案。
- `manage_agent` 的 `link_card` 工具结果本次不带画像（只做 UI）。

### 1.4 决策点（2026-10-21 已决）

1. **彻底取消 vs 改为可配**：选彻底取消。可配需动 profile schema（agent 级预算字段＋装配透传＋i18n），成本跳档；取消 + token 画像（§二）后用户可自调，占比超标再回头做可配——但必须同步更新 tuning doc，不能留两处相反结论。
2. **画像口径**：按“常驻 / ≤最坏”双值 + 最坏占比（单值最坏对 keyword 卡片显著高估，会吓退用户）。
3. **阈值呈现**：只显示数字，不做 15% 警示色/判断。
4. **`applyWorldbookBudget` 去留**：删除。取消默认后无调用方，保留即 dead code；`matchWorldbook` 的 `insertion_order` 排序已覆盖原排序逻辑，无需保留函数体。
5. **`manage_agent` 工具结果**：不带画像，本次只做 UI。
