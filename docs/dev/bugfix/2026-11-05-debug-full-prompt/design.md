# 调试工具显示完整 prompt：方案（Step 1，接线已有快照）

- 日期：2026-11-05
- 状态：已评审，待实现（code-review 结论：无阻塞项，7 条修订已并入本版）
- 版本：v1.0.4（stable 未发，同周期）
- 来源：同目录 `research.md`；只做 Step 1（页内展示已有快照＋补参数字段），Step 2（wire 真值捕获）与落库方案明确不做，见 §三末。

## 一、结论摘要

`getTurnContext()`（`core/session/agent-runner.ts:462-504`）已能即时算出 systemPrompt 全文＋投影后 messages＋tools 全量，`GET .../debug/turn-context` 端点已打通但前端只做下载。本次只做三件事：① contracts `turnContextSnapshot` 加 4 个可选字段（`model`=`provider/id` 字符串/`thinkingLevel`/`sampling`/`currentTokens`，全可选保证新老端兼容）；② runner 取数时附带这 4 项（model 取 `provider/id` 或 null，绝不序列化 `Model` 整体——其 `headers` 可能带敏感头；thinkingLevel 恒有值；sampling 透传；currentTokens 用现有 `readCurrentTokens`，含义为"上次用量优先、否则按当前上下文估算"）；③ `TurnContextDialog` 从纯事件列表改成 事件 / System / Messages / Tools 四页签＋顶部参数行。约 6 文件，零运行时开销，不落盘。注意：展示的是"当前上下文（下一轮近似）"，不是上一次实际发出的请求，UI 必须标注。

## 二、现状（file:line 实证）

- 对话框只有事件流：`TurnContextDialog.tsx:100-151` 拉 `client.getSessionEvents` 渲染 `EventLogRow`；下载按钮（`:79-98`）调 `client.getTurnContext(sessionId)`（`lib/api.ts:779`）存文件，不渲染。
- 快照内容（`:493-503`）：`{sessionId, capturedAt, systemPrompt, messages（fold 后＋projector＋role 过滤＋previewTransforms）, tools（name/description/parameters 全量）}`；缺模型与采样参数。`messages` 为 `AgentMessage[]`，pi-ai `Message[]` 的超集字段在 wire 前由 `convertToLlm` 过滤（`agent-assembly.ts:247-255`）。
- 契约：`contracts/debug.ts:3-15` 无 model/thinking/sampling/currentTokens 字段；core 侧 `session/types.ts:1-11` `TurnContextSnapshot` 同构同样缺失；server 路由（`server/routes/debug.ts:7-13`）只是 `parseContract` 透传，加字段后无需改代码。
- 取数来源均已就绪：`this.agent.state.model`（运行时可能为 undefined，未配置模型时 agent 等待配置，`agent-assembly.ts:220-222`；取 `provider/id` 或 null，绝不序列化 `Model` 整体——其 `headers` 可能带敏感头）、`this.agent.state.thinkingLevel`（`agent-assembly.ts:242` 恒有值，默认 `"medium"`）、`this.deps.runConfig.current().sampling`（`agent-runner.ts:594` 同款调用，`SamplingParams{temperature?,topP?}` 全为可选 number，`core/types.ts:129-132`）、`readCurrentTokens`（`agent-runner.ts:510-516` 已有，含义"上次用量优先、否则按当前上下文估算"）。
- 端点语义（重要，验收口径以此为准）：快照是"打开对话框那一刻的**当前上下文**（turn 结束后含本轮 assistant 回复，即**下一轮将发送的近似**），不是上一次实际发出的请求"；`session-manager.ts:215-219` 未打开抛 `NotFoundError`（对比 events 有 DB 回退 `:228-242`）。UI 必须标注该口径，否则用户第一反应会是"跟我刚发的不一样"。

## 三、方案

### 1. contracts（`packages/contracts/src/debug.ts`）

`turnContextSnapshot` 追加三个**可选**字段（新老端双向兼容：新 server＋旧 app 忽略多余字段；旧 server 缺字段时 app 按 undefined 展示"—"）：

```ts
// model 为 null 表示"未配置模型"（与 undefined 缺字段区分：undefined = 旧 server 未提供）
model: Type.Optional(Type.Union([Type.String(), Type.Null()])),  // "provider/id"，如 "openai/gpt-4o"
thinkingLevel: Type.Optional(Type.Union([  // 与 pi-agent-core ThinkingLevel 对齐，共 7 档
  Type.Literal("off"), Type.Literal("minimal"), Type.Literal("low"), Type.Literal("medium"),
  Type.Literal("high"), Type.Literal("xhigh"), Type.Literal("max"),
])),
sampling: Type.Optional(Type.Object({
  temperature: Type.Optional(Type.Number()),
  topP: Type.Optional(Type.Number()),
})),
currentTokens: Type.Optional(Type.Integer({ minimum: 0 })),      // 上次用量优先，否则按当前上下文估算
```

兼容性说明：全可选＋debug schema 未设 `additionalProperties: false`，新 server＋旧 app（忽略多余字段）、旧 server＋新 app（缺字段显示"—"）双向兼容；若将来收紧 `additionalProperties`，此假设失效（届时重议）。

### 2. core（`session/agent-runner.ts:getTurnContext` ＋ `session/types.ts`）

- `TurnContextSnapshot` 同步加上述四字段（`model: string | null`，`thinkingLevel: ThinkingLevel`（取 pi-agent-core 的 7 档定义——core 自有 `types.ts:134` 的 4 档（settings/profile 管线）是其子集，`thinkingLevel` 在透传路径上恒为 pi 侧类型；contract 有意为超集，settings 不跟进），`sampling?: SamplingParams`，`currentTokens?: number`（整数，非负；`readCurrentTokens` 结果取整钳零后返回，保证契约 `Integer/minimum:0` 恒成立）。
- `getTurnContext` 返回体追加：
  ```ts
  const snapshotModel = this.agent.state.model;
  const snapshotSampling = this.deps.runConfig.current().sampling;
  const estimate = readCurrentTokens(llmMessages, this.agent.state.systemPrompt);
  // …return {
    model: snapshotModel ? `${snapshotModel.provider}/${snapshotModel.id}` : null,
    thinkingLevel: this.agent.state.thinkingLevel,
    sampling: snapshotSampling ? { ...snapshotSampling } : undefined,  // 拷贝，不外泄可变 runConfig
    currentTokens: Math.max(0, Math.floor(estimate)),                  // 恒为非负整数
  ```
  model 取 `provider/id`（与 app 侧模型 id 约定一致，`catalog.ts:276-283` 按 `/` 切分；`pi-ai` `Model` 含不可序列化成员与敏感 `headers`，`models.d.ts:59,716-737`，绝不整体透传）；thinkingLevel 恒有值；sampling 拷贝后透传（不外泄可变 runConfig）；currentTokens 取整钳零后返回，保证契约成立。
- server 路由无改动（`parseContract(schemas.turnContextSnapshot, …)` 自动覆盖新字段）。

### 3. app（`features/debug-tools/TurnContextDialog.tsx`）

- 数据生命周期：打开对话框时并行取 events（现有）＋ snapshot（新增，复用 `client.getTurnContext`）；快照失败（404 未打开会话等）只影响 System/Messages/Tools 页的内联错误＋重试，不阻断事件页；刷新按钮同时刷新两者；搜索框与计数徽章只在事件页显示。
- 页签（复用 `components/ui/tabs.tsx`，`AgentDialogForm.tsx:154` 有用法先例）：事件（现有列表，原样保留为默认页）/ System（`systemPrompt` 纯文本 pre 区，独立滚动）/ Messages（wire 顺序逐条，默认折叠，复用 `EventLogRow` 的折叠模式；title 用 `role` Badge＋content 首行，展开看全文 JSON）/ Tools（逐条默认折叠：`name ＋ description` 做 title，`parameters` schema JSON 做内容）。
- 顶部参数行（definition list，非大模板）：`生成于 capturedAt ＋ model ＋ thinking ＋ temperature/topP ＋ tokens（上次用量/当前预估）`，缺失显示"—"；下一行小字标注"当前上下文快照（fold＋投影后；下一轮请求的近似），非上次实际发出，非逐字节 wire 真值；附件已在投影时剥离"。
- 下载按钮保留（行为不变，JSON 天然包含新字段）。
- i18n 新增 key（en/zh-CN/zh-TW 三地，未翻译的 debug 面板沿用英文，见既有 `debug.*`），拆分为 label 级（避免大模板三语错位）：`debug.promptTabEvents/System/Messages/Tools`、`debug.promptModel/Thinking/Temperature/TopP/Tokens/CapturedAt`、`debug.promptFoldNote`（标注文案）、`debug.promptSnapshotFailed`（快照区内联错误＋重试）。缺失占位 `"—"` 直写（纯符号，无需翻译）。

### 非目标（明确不做）

- 不包 `streamFn`（Step 2，按需另立项；注意 `applySampling/applyReload` 重建会丢包装，需合并设计）。
- 不包 `convertToLlm`（被 Step 2 覆盖，不做两次）。
- 不新增落库 debug 事件（DB 体积＋migration＋隐私三重代价，research §五 D）。
- 不做离线/历史 turn 回放（快照要求 session 在内存；等真实需求）。
- 不回放 decorator 的工具改写（web-search 摘 tool 等）与 sanitize/headers——UI 标注已覆盖该差异。

## 四、测试

- contracts：`api-contracts.test.ts:768` 既有用例追加新字段正样本（含 `model: "openai/gpt-4o"`、`model: null`、`sampling` 部分字段）＋缺字段仍通过（可选性回归）＋非法 `thinkingLevel` / 非数字 `estimatedTokens` 抛错。
- core：`agent-runner.test.ts:366,428,438` 既有 `getTurnContext` 用例旁加断言——`model` 为 `provider/id`（未配置模型时为 null，单独覆盖该分支）、`thinkingLevel` 恒有值、`sampling` 缺配置时为 undefined、`currentTokens` 为非负整数；投影 messages 不变（现有 wire parity 用例 `:438-502` 即回归）。
- server：`debug-routes.test.ts` 新增 turn-context 用例（mock `sessionRuntime.getTurnContext` 返回含新字段快照，断言 200＋字段透传；沿用该文件既有 Fastify inject 模式）；404 用例 mock 必须用同步 `throw`（`mockImplementationOnce(() => { throw … })`，因为真实 `getTurnContext` 是同步函数——若用 `mockRejectedValueOnce`，未 await 的 rejected promise 会直接掉进 `parseContract` 变成误导性的 422/500，而不是预期的 404。
- app：`TurnContextDialog.test.tsx` 扩展 mock（`getTurnContext` 返回含新字段快照）：断言四页签存在、System 页含 systemPrompt 全文、参数行含 model 名与 token 数；`model: null` 时显示占位不断言崩；**`getTurnContext` reject 时事件列表仍渲染、快照页签显示内联错误**（降级用例）。
- 全量回归：`agent-assembly.test.ts`（projector 管线未动，防抖）、`TurnContextDialog` 既有用例、`api.ts` 无改动。

## 五、验收与改动清单

改动文件：`contracts/debug.ts`（schema＋4 可选字段）＋ `contracts/__tests__/api-contracts.test.ts` ＋ `core/session/types.ts` ＋ `core/session/agent-runner.ts:getTurnContext` 取数 ＋ `core/__tests__/session/agent-runner.test.ts` ＋ `server/__tests__/debug-routes.test.ts` ＋ `app/features/debug-tools/TurnContextDialog.tsx`（页签＋参数行＋快照生命周期）＋ `app/features/debug-tools/TurnContextDialog.test.tsx` ＋ i18n 三地 key。

验收：打开调试对话框能看到**当前上下文**的 `systemPrompt 全文 ＋ messages 逐条（wire 顺序）＋ tools 参数 schema ＋ model/thinking/temperature/topP/tokens`，且与下载 JSON 内容一致；参数区标注"当前上下文快照（下一轮近似），非上一次实际请求"；session 未打开时事件页可用、快照页签内联报错；lint、typecheck 通过。

## 六、文档同步

- `Changes.md`：v1.0.4 加一条（调试工具可查看完整 prompt 快照；稳定版未发，同周期）。
- `project-structure.md` / `data-conventions.md` / 各包 README：无影响（无新文件——改的全是既有文件，无数据格式、无包规则变更）。
- i18n：新增 12 个 key（§三列出：4 页签＋6 参数 label＋标注文案＋快照失败文案），三地齐全，`TranslationKey` 自洽检查覆盖。debug 面板沿用英文（与既有 `debug.*` 一致）。
- backlog：Step 2（wire 真值捕获）暂不记——research 结论为"按需"，等逐字节对账的真实需求出现再立项，避免过早占坑。
