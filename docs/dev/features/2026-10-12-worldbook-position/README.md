# worldbook 注入位置修正

- 日期：2026-10-12
- 状态：已实现（2026-10-21，一次性落地数字插入点 0–4；真机 prompt 实测待补，见 tuning doc 待验项）
- 版本：v1.0.3（独立条目；与状态数据外链同批，共用「插到当前用户消息之前」helper）
- 来源：`docs/dev/investigation/2026-10-06-cross-project/06-tavern-vs-agent.md` §四 / §五（拟定 v1.0.x，两条 worldbook 提案之一）

## 范围

把 `<worldbook>` 从「队尾 user（当前用户消息之后）」挪到「当前用户消息之前」，真实输入仍居末位（近因）* 、世界书作前导语境；role 仍 `user`* 、仍 wire-only，仅改插入点。目录*

## 关联

- 现状代码：`packages/core/src/capabilities/card/worldbook.ts:340-349`（`[...messages, worldbook]`）
- 同批：状态数据外链（`../2026-10-11-state-data-link/`，共用 helper）、扩大 worldbook 注入（`../2026-10-12-worldbook-budget/`）

### 2.1 改动点（`worldbook.ts:340-349`）

06 §五公式：`[...messages, wb]` → `[...messages.slice(0, -1), wb, lastMessage]`。role 仍 `user`、仍 wire-only。建议抽成共享 helper（v1.0.3 状态数据外链同需“插到当前用户之前”，两处共用，避免各写一套）。

### 2.2 管线验证（可安全落地的依据）

projector 在 `convertToLlm`（`session/agent-assembly.ts:247-255`）按能力注册序执行：

1. worldbook 跑**第一个**（card 在 `builtinToolCapabilities` 内；见 `factory.ts:47-57` 注册序）。
2. 之后 attachments（原地 strip，`attachments/projector.ts`）、tool-output-budget（原地截断/剪枝）**只做原地变换、不 append**——插点不会被顶掉；末尾 role filter（仅 `user/assistant/toolResult`）保留 user 身份。
3. 剪枝 projector 按 user 消息计数 segment（`pruning-projector.ts:17-21`）：改前后都是 +1 个 user 段（原来 wb 在末尾、现在在倒数第二），常规 wire（user 结尾）剪枝行为一致。
4. `recentTextOf` 先剥 `<worldbook>` 再扫描（:110）——位置移动不影响匹配与自反馈阻断。
5. projector 只活在 wire 视图，不进持久化 log；debug turn-context 快照（`agent-runner.ts:451`）走同一管线，天然一致。

### 2.3 两个 edge 必须处理

- **空 `messages`**：`constant` 条目空扫也能命中（:38 恒注入），`messages[length-1]` 为 undefined 会污染数组——必须 guard（空数组直接返回原样或回退 append）。
- **wire 末尾非 user**：turn 内多轮 LLM 调用时末尾可能是 `toolResult`；公式无条件插到它前面（与 06 口径一致），可接受，但要在测试里钉住该行为。

### 2.4 测试与文档同步

- 重写 `worldbook.test.ts:201`（断言 wb 在 `out[1]`；单 user 输入下改后 wb 应在 `out[0]`、用户消息居末）＋ 新增：多消息顺序、空数组 guard、非 user 结尾、与 attachments/budget projector 组合顺序（worldbook 仍在 user 之前）。
- 同步 `worldbook-order-tuning.md` 第 9 行“追加于消息尾”约定＋待验项 #4（位置语义 resolve 为 before-current-user）。

## 三、建议顺序与风险

1. 先位置项（纯插入点移动，风险封闭，测试可全覆盖）。
2. 后预算项（等决策点 1.4 定案；若选取消，建议同一 PR 内补“占比超标回滚预案”说明，避免 tuning doc 自相矛盾）。
3. 共同风险：`constant` 条目在两种改动叠加下每轮必注且位置提前——大 constant 卡的注意力稀释是调优 doc 待验项 #2 的原有担忧，改动不新增风险，但也不缓解。