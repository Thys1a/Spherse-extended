# worldbook position plan（数字插入点 0–4）

用户决策：在 budget 项之后串行执行；旧值（`""` / `before_char` / `after_char`）一律归一为 3；位置用数字编号（0=MCP 前，1=MCP 后，2=历史锚点+depth，3=当前用户前默认，4=队尾旧行为）；不限制插入点数量（≥3 个 warn 一次/会话）；本次不做位置选择 UI（文档 + `edit_card` 工具说明）。
详见同目录 `design.md`；本 plan 只列执行步骤。

## A：数据模型（core card 包）

- [x] `types.ts`：`CardPosition` 改为 `0 | 1 | 2 | 3 | 4`；`CardEntrySummary` / `EntryPatch` 加 `depth?: number`
- [x] `parser.ts:21-40`：数字 0..4 保留；旧字符串/缺失归一为 3；读 `raw.depth`（整数 ≥ 1 校验）
- [x] `card-store.ts`：`WRITABLE_FIELDS`（:34-45）加 `depth`；`validatePatch`（:51-85）按 design §2.4 加规则（position 2 必填 depth、非 2 携带 depth 拒绝）；`canonicalEntry`（:91-106）默认 `position: 3`、`depth` 仅传入时写出；`toSummary`（:195-206）透传两字段
- [x] `search.ts:104-116`：搜索摘要补 `position` / `depth`
- [x] 测试：`t3` 默认 add 键集合不变 + 带 depth 的 add/非法组合拒绝；`t1/t2/t5` fixture 补解析/摘要断言（`depth` optional 不破 typed literal）
- [x] verify：`npm test --workspace=packages/core`

## B：契约与工具

- [x] `contracts/card.ts:10` 数字 union；`entryPatch`（`additionalProperties: false`）加 `depth`；summary / entry / search 响应加两字段
- [x] `card/tools.ts:225-236` `CardEntryBody` 同步；`EDIT_CARD_GUIDE`（:24-27）追加 design §2.2 五位置优劣；`errorText`（:37）可写字段列表加 `depth`
- [x] `server/routes/card.ts` 无逻辑改动，补 depth 往返测试
- [x] 测试：`contracts/card.test.ts` / `server/card-routes.test.ts`（depth 接受、非法 position/depth 拒绝）
- [x] verify：contracts / server / core 相关单测

## C：运行时 messages 侧（2/3/4）

- [x] `worldbook.ts` 新增 `selectWorldbookEntries(entries, messages)`：`matchWorldbook(recentTextOf(messages), entries)` → 按 `(position, depth)` 分组，组内保持 `insertion_order`（预算步骤按 design §六二选一；budget 先合入则无此步）
- [x] 插入 helper（`userSegmentIndex`，导出供状态数据外链复用——本次未抽跨 feature 共享模块）；`n = position===3 ? 1 : depth`，下标先对原始数组算好、倒序落位；4 为末尾追加；超限 clamp 到最前；at_depth 缺有效 depth 回退 3（warn 仅 system hook 发出，见 D）
- [x] 分组渲染 `<worldbook>` 块（包装格式不变）；user 侧插入点数量不做硬限制，少于三个的建议只落文档与工具说明（projector 无 logger，不做运行时 warn）
- [x] 测试：`worldbook.test.ts:201-213` 改按 position 断言下标；新增 0/1/2/3/4 各一条、depth=1/2/超限 clamp、多位置组合、缺 depth 回退、同下标跨组保序、与 attachments projector 组合顺序（budget 剪枝组合未补——pruning 只改 toolResult 内容不增删条目，无交互面）
- [x] verify：`npm test --workspace=packages/core`

## D：运行时 system 侧（0/1）

- [x] `mcp/block.ts` 导出 MCP 哨兵 `<!-- spherse:mcp-context:start -->` 为常量
- [x] `worldbook.ts` 新增 `worldbookSystemCapability`（实际落 `capability.ts`）：`beforeTurn` 每轮取历史 + 本轮文本 → `selectWorldbookEntries` 取 0/1 分组 → 剥两个哨兵区块 → 0 插 MCP 哨兵前（无 MCP 则追加末尾）/ 1 追加末尾；无命中只剥离；缺 depth warn 一次/hook 实例（logger 由 factory 透传）
- [x] `factory.ts:47-58` 注册在 `createMcpCapability` 之后
- [x] 测试：0/1 两序 × 有/无 MCP、剥离幂等、缺 depth warn、时序（state 无本轮文本 + pending 文本）、runner 传参（`sendMessage` 把本轮文本传给 `beforeTurn`；`retryLastTurn` 传空、历史里已有）；`getTurnContext` 全会话集成未补——hook 写 state 即其读取源（`agent-runner.ts:480-490`），成本过高降为未覆盖项（见 design §五）
- [x] verify：`npm test --workspace=packages/core`

## E：收尾

- [x] `tool-output-budget.test.ts:96-146`：若管线含 worldbook 重钉 segment 算术；digest 算段语义（:135-146）不得破
- [x] tuning doc：`:9`“追加于消息尾”→ 新默认；待验项 #4 结清；记 messages 侧每调用重算 vs system 侧每 turn 一次的不对称（`agent-runner.ts:223`）
- [x] `positions-card-op.md` §四决策点 1/2/5 标注已落 `design.md`；本 README 状态改为已完成；backlog 无本项条目可勾（仅 budget review 新增的本体卡条目，不属本项）
- [x] verify：`npm run verify`

提交：A–E 一笔 commit（`chore:` 前缀；旧 position 字符串读时归一、不回写，无数据迁移）。
