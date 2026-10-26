# ask-unlock 设计（2026-10-24）

排期：v1.0.3（feature）。
来源：`docs/dev/features/2026-10-24-ask-unlock/research.md`，以及用户确认的 per-agent 方案。

## 1. 已定决策

1. `ask_user` 超时做成 per-agent 可配项：
   - 默认保持现有行为：缺省 600s，可配 60–3600s；
   - 启用后永不超时，不再自动按最佳判断继续。
2. 工具调用次数做成 per-agent 可配项：
   - 默认保持单轮 30 次限制；
   - 启用后只解除 `MAX_TOOL_CALLS_PER_TURN`；
   - `MAX_SAME_TOOLCALL_REPEAT` 和 `MAX_CONSECUTIVE_TRUNCATED_TURNS` 不动。
3. trigger / 后台运行的 `ask_user` 行为保持现状，不做禁用或 fast-fail。
4. `QuestionCard` 不改：无限等待时始终保持可回答状态，不引入倒计时。

非目标：

- 不引入全局开关；
- 不支持自定义超时秒数或自定义调用次数；
- 不改压缩、预算统计或事件持久化结构；
- 不改 `ask_user` 请求/响应事件形状。

## 2. 数据与契约模型

### 2.1 `AgentProfile`

在 `packages/core/src/types.ts:30-54` 新增：

```ts
unlimitedAsk?: boolean;
unlimitedToolCalls?: boolean;
```

语义：

- 字段缺省或 `false` 时保持现有默认行为；
- 只有显式 `true` 才启用无限行为；
- 两个开关互相独立。

### 2.2 后端 frontmatter 解析

在 `packages/core/src/store/agent-profile.ts:116-147` 增加：

```ts
unlimitedAsk: data.unlimitedAsk === true || undefined,
unlimitedToolCalls: data.unlimitedToolCalls === true || undefined,
```

沿用 `yolo` 的写入约定：只有 `true` 才落盘，避免历史 profile 产生噪声字段。

### 2.3 契约包

在 `packages/contracts/src/agents.ts:49-55` 的 `agentProfile` 中增加：

```ts
unlimitedAsk: Type.Optional(Type.Boolean()),
unlimitedToolCalls: Type.Optional(Type.Boolean()),
```

说明：

- agent 创建/更新接口仍以 markdown `content` 字符串传输，请求体形状不变；
- 需要改的是 `agentProfile` 响应契约和派生出的 `AgentProfileContract`，否则服务端返回的新字段在渲染 / UI-SDK 侧不可见。

### 2.4 前端表单

在 `packages/app/src/features/agent-dialog/agent-markdown.ts`：

- `AgentFormData` 增加 `unlimitedAsk: boolean`、`unlimitedToolCalls: boolean`；
- 解析缺省为 `false`，显式 `true` 才为 `true`；
- 序列化时只有 `true` 才写入 frontmatter；
- 未识别字段继续保留在 `extraFrontmatter`。

## 3. `ask_user` 实现

### 3.1 工具构造

修改 `packages/core/src/tools/ask-user.ts:57`：

```ts
export function createAskUserTool(
  askGate?: AskGate,
  options?: { unlimitedTimeout?: boolean },
)
```

在 `packages/core/src/capabilities/interaction/index.ts:6-13` 传入：

```ts
createAskUserTool(host.askGate, {
  unlimitedTimeout: host.profile.unlimitedAsk === true,
})
```

`host.profile` 已存在，无需新增上下文通道。

### 3.2 超时语义

`execute` 中的规则：

```ts
const unlimitedTimeout = options?.unlimitedTimeout === true;
const timeoutMs = unlimitedTimeout
  ? Number.POSITIVE_INFINITY
  : clampTimeoutS(params.timeout_s) * 1000;
```

- 默认仍走 `clampTimeoutS`，60–3600s，缺省 600s；
- 启用无限后忽略用户传入的 `timeout_s`；
- `timeout_s` 参数校验形状不变，只更新其描述，说明该 Agent 下会被忽略；
- 启用无限时工具描述追加说明：等待用户回答，直到回答、会话中止或会话关闭；
- 无限模式下 `timedOut` 不会由 timer 产生，现有超时提示文案保持不变。

`askGate` 本身是透传层，不需要新增逻辑。

## 4. `control-bus` 无 timer 分支

修改 `packages/core/src/session/control-bus.ts:16-60`：

- `PendingRequest.timer` 改为可选字段：`timer?: NodeJS.Timeout`；
- `request` 仅在 `timeoutMs` 为有限值时创建 `setTimeout`；
- 当 `timeoutMs === Number.POSITIVE_INFINITY` 时只写入 `pending`，不创建 timer；
- 不用 `Number.isFinite(timeoutMs)` 做分支，避免改变 `NaN` 或其他非法值的原有行为；
- `resolve` 和 `rejectAll` 只在 timer 存在时调用 `clearTimeout`；
- 请求、解决、中止事件形状不变。

测试需要覆盖：

- 无限请求仍发出 `control_request`；
- 推进 timer 不会自动解决；
- 后续 `resolve` 可正常返回答案；
- `rejectAll` 可以拒绝该请求并发出中止事件。

## 5. 工具调用预算实现

修改 `packages/core/src/session/agent-runner.ts`：

- runner 增加可变字段，例如 `private unlimitedToolCalls = false`；
- 私有构造函数增加对应参数并设置默认值；
- `AgentRunner.init:98-114` 读取 `agentStore.getProfile()`，把
  `profile.unlimitedToolCalls === true` 传给构造函数；
- `checkToolLoopStop:772-792` 改为：

```ts
if (!this.unlimitedToolCalls && this.toolCallTotal > MAX_TOOL_CALLS_PER_TURN) {
  this.toolLoopStop = "tool-call-budget";
}
```

- `tool-call-repeat` 和 `truncated-loop` 分支不动；
- `resetToolLoopGuard:739-744` 不动；
- 预算提示文案不动，因为无限模式下预算分支不可达；
- `applyReload:562-594` 在读取最新 profile 后同步更新该字段，保证开关在下一轮生效；
- tools 重建已包含最新 `unlimitedAsk`，不需要对 ask 另做 reload 特殊处理。

## 6. 会话关闭与无限等待的清理

这是取消超时后必须补上的缺口：目前只有 `abort()` 调用
`controlBus.rejectAll()`，而删除会话不会中止运行中 turn。

修改 `packages/core/src/session/session-manager.ts:307-338`：

- `destroySession` 删除前先对该 runner 调用 `abort()`；
- `evictAgent` 对被驱逐的每个 runner 先调用 `abort()`；
- `closeAll` 清空前先对所有 runner 调用 `abort()`；
- 已有 `isBusy()` 保护的 `releaseSession` 保持不变；
- 不引入只拒绝 promise 的轻量 `dispose()`，因为被销毁的会话同时也应停止模型执行。

跨进程重启不需要额外处理：

- `derivePendingControls:122-141` 在 `turn/end` 清空 pending；
- `repairLog:146-204` 会把中断的 open turn 补一个失败 tool result 和 `turn/end`；
- 因此无限 ask 不会在重启后复活或重发问题。

## 7. 前端交互

修改 `packages/app/src/features/agent-dialog/AgentDialogForm.tsx:108-125,182-203`：

- 工具变更时同步清理无效开关：
  - 移除 `ask_user` 时把 `unlimitedAsk` 置为 `false`；
  - 没有任何工具时把 `unlimitedToolCalls` 置为 `false`；
- 提交时同样做有效性归一化，不依赖 UI 是否渲染；
- `unlimitedAsk` 行只在选中 `ask_user` 时展示；
- `unlimitedToolCalls` 行只在至少选中一个工具时展示；
- 两行都不复用“高级工具” gating 逻辑；
- `yolo` 的现有展示和强制逻辑不变。

## 8. i18n

新增键遵循现有 `agent-dialog.*Label/Hint` 约定：

```ts
"agent-dialog.unlimitedAskLabel": "Ask without timeout",
"agent-dialog.unlimitedAskHint": "When enabled, ask_user waits until the user answers or the session is aborted or closed. timeout_s is ignored.",
"agent-dialog.unlimitedToolCallsLabel": "Remove per-turn tool-call limit",
"agent-dialog.unlimitedToolCallsHint": "The default limit is 30 tool calls per turn. When enabled, the total-count limit is removed; same-tool repeat and consecutive truncation guards remain.",
```

中文：

```ts
"agent-dialog.unlimitedAskLabel": "永不超时提问",
"agent-dialog.unlimitedAskHint": "启用后，该 Agent 的 ask_user 将一直等待用户回答，直到回答、会话中止或会话关闭；timeout_s 会被忽略。",
"agent-dialog.unlimitedToolCallsLabel": "解除单轮工具调用次数限制",
"agent-dialog.unlimitedToolCallsHint": "默认单轮最多调用 30 次工具。启用后不再按总数截断，但仍保留同工具同参数连续重复 3 次和连续输出截断 3 轮的保护。",
```

繁中：

```ts
"agent-dialog.unlimitedAskLabel": "永不超時提問",
"agent-dialog.unlimitedAskHint": "啟用後，該 Agent 的 ask_user 將一直等待使用者回答，直到回答、工作階段中止或工作階段關閉；timeout_s 會被忽略。",
"agent-dialog.unlimitedToolCallsLabel": "解除單輪工具呼叫次數限制",
"agent-dialog.unlimitedToolCallsHint": "預設單輪最多呼叫 30 次工具。啟用後不再按總數截斷，但仍保留同工具同參數連續重複 3 次和連續輸出截斷 3 輪的保護。",
```

实现时仍应加载 **i18n** skill 按仓库流程同步三个 locale。

## 9. 测试矩阵

1. `core/src/__tests__/tools/ask-user.test.ts`
   - 启用无限后 gate 收到的 timeout 为 `Infinity`，且任意 `timeout_s` 都被忽略；
   - 默认仍保持 60–3600s 钳制和 600s 缺省。
2. `core/src/__tests__/session/control-bus.test.ts`
   - 无限请求不自动超时；
   - `resolve` 和 `rejectAll` 行为正确。
3. `core/src/__tests__/session/agent-runner.test.ts`
   - 默认 profile 下第 31 次工具结果触发 `tool-call-budget`；
   - 启用后多次调用不触发该分支；
   - 重复调用和截断保护仍然触发；
   - `applyReload` 能把开关从关改到开、从开改到关。
4. `contracts/src/__tests__/api-contracts.test.ts`
   - `agentProfile` 接受并透传两个新可选字段。
5. `app/src/features/agent-dialog/agent-markdown.test.ts`
   - 解析缺省为 `false`；
   - `true` 可写入并可解析；
   - `false` 不写入 frontmatter。
6. `AgentDialogForm.test.tsx`
   - 移除 `ask_user` 后开关被清理；
   - 无工具时提交不会保留超限开关。
7. 会话清理回归
   - 无限 ask 进行中销毁会话时 promise 被拒绝，不悬挂。

## 10. 验收标准

- 默认 Agent 的 ask 超时和 30 次预算行为与原来一致；
- 显式开启 `unlimitedAsk` 的 Agent 不再因超时自动继续；
- 显式开启 `unlimitedToolCalls` 的 Agent 可超过 30 次，但重复和截断保护仍有效；
- 开关修改后下一轮生效；
- 销毁、驱逐或关闭会话不会留下未解决的无限 ask；
- 重启不会复活中断的无限 ask；
- 无 API 请求体破坏性变更；
- lint、typecheck、相关单测和 i18n 检查通过。
