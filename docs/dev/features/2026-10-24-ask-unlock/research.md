# ask 工具：取消超时＋调用次数开关（调研，非 design）

- 日期：2026-10-24
- 排期：v1.0.3（feature）
- 需求（用户原话）：ask 工具不再超时；开关解除 agent 有限次数工具调用。
- 范围：`core/src/tools/ask-user.ts`、`core/src/session/ask-gate.ts`、`core/src/session/control-bus.ts`、`core/src/session/agent-runner.ts:37-39,740-744,772-792`、`app/.../chat/QuestionCard.tsx`

## 一、ask 超时机制现状

- `ask_user`（`tools/ask-user.ts:57-119`）`executionMode: "sequential"`（`:64`）：整轮等待答案。
- 超时三档：`timeout_s` 参数 → `clampTimeoutS` 钳在 60–3600s、默认 600s（`:8-10,40-43`）；`askGate.ask` → `control-bus.request` 的 `setTimeout`（`control-bus.ts:37-45`）；无 gate / abort / 超时均回退“自行判断继续”（`ask-user.ts:74-84,97-111,121-129`）。
- 取消路径已齐：`signal.aborted`（`:70`）、`rejectAll`（abort 时 `agent-runner.ts:441` → `control-bus.ts:72-79`，question 一并 reject，有用例 `control-bus.test.ts:156-182`）。
- UI 无倒计时：`QuestionCardRenderer` 只有 pending/answered/timeout 三态（`QuestionCard.tsx:48-59`），靠 control 事件驱动——取消超时后 timeout 态永不触发，UI 无需改。

## 二、取消超时要动的位置

1. `ask-user.ts`：`timeout_s` 需一个“永不”哨兵（如 `0`，当前会被钳成 60），`clampTimeoutS` 加分支。
2. `ask-gate.ts` / `control-bus.request`：`setTimeout(Infinity)` 会立即触发（Node 钳制），必须加无 timer 分支（只 `pending.set` 不设 timer）。
3. 生命期：无限等待的 promise 完全依赖 abort/rejectAll 兜底；会话销毁不清 pending 会永久挂起——需核实 destroy/close 路径是否都走 `rejectAll`（abort 走，已验证；其余待查）。
4. 跨重载：`fold.ts:125-141` 收集 pending control 条目用于恢复，未核实永不超时的 question 在 restore 后是否重发、可否再应答（待查）。
5. “后台别 ask”仍只是文案（`:62`），取消超时后 trigger run 误调的代价从“等 timeout”变成“永远等”——开关/限制语义需一并定（见 bugfix/2026-10-24-ask-blocked 撤销前的结论，已删）。

## 三、有限次数调用限制现状

- 三个硬编码常量（`agent-runner.ts:37-39`），每轮开始重置（`:740-744`）：
  - `MAX_TOOL_CALLS_PER_TURN = 30`（`:780-781` → `tool-call-budget` 停轮）
  - `MAX_SAME_TOOLCALL_REPEAT = 3`（同工具同参连调停轮）
  - `MAX_CONSECUTIVE_TRUNCATED_TURNS = 3`（连续截断停轮）
- 无任何配置面：profile/settings 均无对应项，改数字只能改源码。
- 开关先例（yolo）：profile frontmatter 布尔（`store/agent-profile.ts:135`、`types.ts:48`）→ `agent-assembly.ts:157` 按值取舍行为 → 对话框 UI＋i18n。解限开关可照抄该链路（如 `maxToolCalls?: number` 或 `unlimitedTools?: boolean`），落点：`agent-assembly.ts` 传入 runner（现无参数通道，需新增）、`agent-runner.ts:780` 跳过 budget 检查（repeat/truncated 是否一并放行待定）。
- 注意：放开 30 上限会拉长单轮 → 压缩/预算行为变化属预期副作用，无需联动改。

## 四、既有测试

- `tools/ask-user.test.ts`（gate/超时/无 gate/abort）、`session/control-bus.test.ts`（question 往返、rejectAll）、runner 内 `ask_user routes through the control bus`、`AgentRunner yolo mode`（开关模式范例）。

## 五、待用户确认（出 design 前必须定）

1. “不再超时”是默认行为还是可配（per-agent 开关随 2 一起做，还是全局一刀切）？
2. 解限开关放哪：agent profile 字段（照 yolo，含对话框 UI＋i18n）还是全局设置？只放 `tool-call-budget` 还是三闸全放？
3. trigger/后台 run 的 ask：禁用、fast-fail，还是保持现状？
