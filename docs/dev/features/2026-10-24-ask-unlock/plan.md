# plan：ask 超时与工具调用预算 per-agent 可配

- 对应设计：同目录 `design.md`（审查通过，待实施）

## 任务（按序，前者是后者的前置）

### 1. core 数据模型：`types.ts`＋`store/agent-profile.ts`

`AgentProfile` 加 `unlimitedAsk?`、`unlimitedToolCalls?`（显式 `true` 生效）；frontmatter 解析沿 yolo 惯例（仅 `true` 落盘）。

- verify：`npm test --workspace=packages/core` 相关用例绿（解析缺省 false / true 写回 / false 不写回）。

### 2. ask 超时链：`tools/ask-user.ts`＋`capabilities/interaction`＋`control-bus.ts`

`createAskUserTool(gate, { unlimitedTimeout })`，无限时 `timeoutMs = Infinity` 并忽略 `timeout_s`（校验形状不动，改参数描述＋工具描述）；`interaction/index.ts` 传入 `host.profile.unlimitedAsk === true`；`PendingRequest.timer` 可选化，仅有限值设 timer；`resolve`/`rejectAll` 只在 timer 存在时 `clearTimeout`。

- verify：`npm test --workspace=packages/core -- src/__tests__/tools/ask-user.test.ts src/__tests__/session/control-bus.test.ts`（无限 gate 收 `Infinity`、默认钳制不变、无限请求不自动超时、可 resolve/rejectAll）。

### 3. 预算链：`session/agent-runner.ts`

runner 加可变 `unlimitedToolCalls`；`init` 从 profile 传入；`checkToolLoopStop` 仅默认分支触发 `tool-call-budget`；`applyReload` 同步刷新；repeat/截断分支不动。

- verify：`npm test --workspace=packages/core -- src/__tests__/session/agent-runner.test.ts`（第 31 次默认触发、无限不触发、repeat/截断仍触发、reload 开关双向翻转）。

### 4. 会话清理：`session/session-manager.ts`

`destroySession`/`evictAgent`/`closeAll` 删除前先 `abort()` 对应 runner；`releaseSession`（有 busy 保护）不动。

- verify：无限 ask 进行中销毁会话，promise 被拒绝不悬挂（core 会话清理用例）。

### 5. 契约：`contracts/src/agents.ts`

`agentProfile` 加两个可选 boolean；创建/更新请求体不动。

- verify：`npm test --workspace=packages/contracts`（`agentProfile` 接受并透传新字段）。

### 6. 前端：表单＋解析＋i18n

`agent-markdown.ts`（`AgentFormData` 加两字段、缺省 false、true 写回、false 不写、未知字段保留）；`AgentDialogForm.tsx`（开关行按工具存在性展示＋提交归一化，不碰 yolo 逻辑）；三语 i18n 新增 4 键（走 i18n skill 同步）。

- verify：`npm test --workspace=packages/app -- src/features/agent-dialog/agent-markdown.test.ts src/features/agent-dialog/AgentDialogForm.test.tsx`（解析缺省/写回/清理行为）；`npm run check:i18n`（或 `npm run verify` 链内覆盖）。

### 7. 收尾门

- verify：`npm run lint`、`npm run build` 后 `npm run typecheck`、`npm test --workspace=packages/core --workspace=packages/contracts --workspace=packages/app`（或根 `npm run verify`）；合并前 `npm run verify:e2e`。
- 验收：design §10 逐项通过（默认行为不变、开关下一轮生效、销毁/重启不悬挂不复活、无破坏性 API 变更）。
