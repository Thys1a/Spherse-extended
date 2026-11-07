# 调试工具显示完整 prompt：方案（Step 1，接线已有快照）

- 日期：2026-11-05
- 状态：待评审
- 版本：v1.0.4（stable 未发，同周期）
- 来源：同目录 `research.md`；只做 Step 1（页内展示已有快照＋补参数字段），Step 2（wire 真值捕获）与落库方案明确不做，见 §三末。

## 一、结论摘要

`getTurnContext()`（`core/session/agent-runner.ts:462-504`）已能即时算出 systemPrompt 全文＋投影后 messages＋tools 全量，`GET .../debug/turn-context` 端点已打通但前端只做下载。本次只做三件事：① contracts `turnContextSnapshot` 加 3 个可选字段（`model`/`thinkingLevel`/`sampling`，全可选保证新老端兼容）；② runner 取数时附带这 3 项（`agent.state.model/thinkingLevel`＋`deps.runConfig.current().sampling`，model 只取 `id` 字符串）；③ `TurnContextDialog` 从纯事件列表改成 事件 / System / Messages / Tools 四页签＋顶部参数行。约 6 文件，零运行时开销，不落盘。

## 二、现状（file:line 实证）

- 对话框只有事件流：`TurnContextDialog.tsx:100-151` 拉 `client.getSessionEvents` 渲染 `EventLogRow`；下载按钮（`:79-98`）调 `client.getTurnContext(sessionId)`（`lib/api.ts:779`）存文件，不渲染。
- 快照内容（`:493-503`）：`{sessionId, capturedAt, systemPrompt, messages（fold 后＋projector＋role 过滤＋previewTransforms）, tools（name/description/parameters 全量）}`；缺模型与采样参数。`messages` 为 `AgentMessage[]`，pi-ai `Message[]` 的超集字段在 wire 前由 `convertToLlm` 过滤（`agent-assembly.ts:247-255`）。
- 契约：`contracts/debug.ts:3-15` 无 model/thinking/sampling 字段；core 侧 `session/types.ts:1-11` `TurnContextSnapshot` 同构同样缺失；server 路由（`server/routes/debug.ts:7-13`）只是 `parseContract` 透传，加字段后无需改代码。
- 取数来源均已就绪：`this.agent.state.model`（`Model<Api> | undefined`，未配置模型时为 undefined，`agent-runner.ts:518-529` 有判空先例，取 `model?.id ?? null` 只留可序列化标量）、`this.agent.state.thinkingLevel`（`agent-assembly.ts:242` 恒有值，默认 `"medium"`）、`this.deps.runConfig.current().sampling`（`agent-runner.ts:594` 同款调用，`SamplingParams{temperature?,topP?}` 全为可选 number，`core/types.ts:129-132`）。
- 端点语义不变：快照仍是"当前内存会话的即时计算"，`session-manager.ts:215-219` 未打开抛 `NotFoundError`（对比 events 有 DB 回退 `:228-242`）；UI 需在标题区标注"fold＋投影后视图，非逐字节 wire 真值"，避免与落库事件混淆。

## 三、方案

### 1. contracts（`packages/contracts/src/debug.ts`）

`turnContextSnapshot` 追加三个**可选**字段（新老端双向兼容：新 server＋旧 app 忽略多余字段；旧 server 缺字段时 app 按 undefined 展示"—"）：

```ts
model: Type.Optional(Type.String()),              // model id，如 "openai/gpt-4o"
thinkingLevel: Type.Optional(Type.Union([
  Type.Literal("off"), Type.Literal("low"), Type.Literal("medium"), Type.Literal("high"),
])),
sampling: Type.Optional(Type.Object({
  temperature: Type.Optional(Type.Number()),
  topP: Type.Optional(Type.Number()),
})),
```

### 2. core（`session/agent-runner.ts:getTurnContext` ＋ `session/types.ts`）

- `TurnContextSnapshot` 同步加上述三字段（`model: string | null`，`thinkingLevel: ThinkingLevel`，`sampling?: SamplingParams`）。
- `getTurnContext` 返回体追加：
  ```ts
  model: this.agent.state.model?.id ?? null,
  thinkingLevel: this.agent.state.thinkingLevel,
  sampling: this.deps.runConfig.current().sampling,
  ```
  model 只取 `id`（`pi-ai` `Model` 对象含不可序列化成员，`models.d.ts:59 readonly id: string`）；thinkingLevel 恒有值；sampling 可能为 undefined（未配置时），透传即可。
- server 路由无改动（`parseContract(schemas.turnContextSnapshot, …)` 自动覆盖新字段）。

### 3. app（`features/debug-tools/TurnContextDialog.tsx`）

- 页签：事件（现有列表，原样保留为默认页）/ System（`systemPrompt` 纯文本 pre 区）/ Messages（wire 顺序逐条：`role` Badge＋content JSON，可复用 `eventPreview` 的文本提取展示 title，展开看全文）/ Tools（`name ＋ description ＋ parameters` schema JSON）。
- 顶部参数行：`capturedAt ＋ model/thinkingLevel/temperature/topP`（缺失显示"—"），下一行小字标注"fold＋投影后视图（filter/截断前），非逐字节 wire 真值；附件已在投影时剥离"。
- 下载按钮保留（行为不变，JSON 天然包含新字段）。
- i18n 新增 key（en/zh-CN/zh-TW 三地，参考 `debug.turnContext` 命名）：`debug.promptTabEvents/System/Messages/Tools`、`debug.promptParams`（参数行模板）、`debug.promptFoldNote`（标注文案）、缺失占位复用已有 `common` 或 `"—"` 直写（纯符号，无需翻译）。

### 非目标（明确不做）

- 不包 `streamFn`（Step 2，按需另立项；注意 `applySampling/applyReload` 重建会丢包装，需合并设计）。
- 不包 `convertToLlm`（被 Step 2 覆盖，不做两次）。
- 不新增落库 debug 事件（DB 体积＋migration＋隐私三重代价，research §五 D）。
- 不做离线/历史 turn 回放（快照要求 session 在内存；等真实需求）。
- 不回放 decorator 的工具改写（web-search 摘 tool 等）与 sanitize/headers——UI 标注已覆盖该差异。

## 四、测试

- contracts：`api-contracts.test.ts:768` 既有用例追加新字段正样本（全字段）＋缺字段仍通过（可选性回归）＋非法 `thinkingLevel` 抛错。
- core：`agent-runner.test.ts:366,428,438` 既有 `getTurnContext` 用例旁加断言——`model` 取 id 字符串（未配置模型时为 null）、`thinkingLevel` 恒有值、`sampling` 缺配置时为 undefined；投影 messages 不变（现有 wire parity 用例 `:438-502` 即回归）。
- server：`debug-routes.test.ts` 新增 turn-context 用例（mock `sessionRuntime.getTurnContext` 返回含新字段快照，断言 200＋字段透传；沿用该文件既有 Fastify inject 模式）。
- app：`TurnContextDialog.test.tsx` 扩展 mock（`getTurnContext` 返回含新字段快照）：断言四页签存在、System 页含 systemPrompt 全文、参数行含 model 名；无快照字段时显示占位不断言崩。
- 全量回归：`agent-assembly.test.ts`（projector 管线未动，防抖）、`TurnContextDialog` 既有用例。

## 五、验收与改动清单

改动文件：`contracts/debug.ts`（schema＋3 可选字段）＋ `contracts/__tests__/api-contracts.test.ts` ＋ `core/session/types.ts` ＋ `core/session/agent-runner.ts:getTurnContext` 取数 ＋ `core/__tests__/session/agent-runner.test.ts` ＋ `server/__tests__/debug-routes.test.ts` ＋ `app/features/debug-tools/TurnContextDialog.tsx`（页签＋参数行）＋ `app/features/debug-tools/TurnContextDialog.test.tsx` ＋ i18n 三地 key。

验收：打开调试对话框能看到与本次 turn 一致的 `systemPrompt 全文 ＋ messages 逐条（wire 顺序）＋ tools 参数 schema ＋ model/thinking/temperature/topP`，且与下载 JSON 内容一致；session 未打开时保持现有报错行为；lint、typecheck 通过。

## 六、文档同步

- `Changes.md`：v1.0.4 加一条（调试工具可查看完整 prompt 快照；稳定版未发，同周期）。
- `project-structure.md` / `data-conventions.md` / 各包 README：无影响（无新文件——改的全是既有文件，无数据格式、无包规则变更）。
- i18n：新增 6 个 key（§三列出），三地齐全，`TranslationKey` 自洽检查覆盖。
- backlog：Step 2（wire 真值捕获）暂不记——research 结论为"按需"，等逐字节对账的真实需求出现再立项，避免过早占坑。
