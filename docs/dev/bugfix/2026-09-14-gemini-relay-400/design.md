# 中转 Gemini 路由 400 调研：tool schema 无类型空节点触发上游 INVALID_ARGUMENT

调研时间：2026-09-14
状态：根因已定位到类；修复方案 A2 已立项（2026-09-14），见 §8
_

## 1. 现象

- 用户项目某会话（agent ，空白新对话）Gemini模型 发送即 400，UI 报错全文：
  `400: {"message":"Request contains an invalid argument.","type":"invalid_request_error"}`
- 同一中转站另一分组（GPT 模型）在 Spherse 侧调用正常。
- 同一 key 在 opencode 调用正常。
- 此前该模型在 Spherse 侧可用，突然报错（2026-09-14 16:38 起有落盘记录）。

DB 实锤（项目 `.spherse/agents/*-6c59ab/sessions.db`，`events` 表，`type='assistant/message'`，`stopReason='error'`）：

| session | seq | time | model | errorMessage |
|---|---|---|---|---|
| `0ea58f96-…` | 2 | 2026-09-14 16:38:43 | `gemini-3.8-flash` | `400: {"message":"Request contains an invalid argument.","type":"invalid_request_error"}` |

DB 与 UI 是同一字符串，无更多信息（`errorMessage` 即 pi-ai 组装后的 `status: body`，body 上限 4000 字符）。

## 2. 诊断过程的两个误判（已纠正）

1. “域名已死”：`nslookup` 经路由/8.8.8.8/阿里全回 NXDOMAIN，但实为 53 端口查询被干扰——`.NET` 解析出 `15.204.83.247`，经本机 Clash（`127.0.0.1:7890`，`curl.exe -v` 可见 `200 Connection established`）建连成功，无 key 调 `/v1/models` 正常返回 `401 API_KEY_REQUIRED`。网关活着。
2. “用户 curl 的 `URL rejected: Bad hostname`”：用户 shell 的 `curl` 是 PowerShell 别名（→`Invoke-WebRequest`），非真 curl；且 PS 5.1 传参会损坏 JSON 引号（表现为 `Failed to parse request body` 误导项）。后续诊断统一用 `curl.exe` + `-d @file`。

## 3. curl 复现矩阵（`curl.exe`，真 key，已扣少量额度）

| # | 请求体 | 结果 |
|---|---|---|
| 1 | 最小对话（`stream:false`） | `200` |
| 2 | 流式 + system + `temperature:1` + `stream_options.include_usage` | `200` SSE |
| 3 | 单 tool（含 `strict:true`） | `200`，正常返回 `tool_calls` |
| 4 | tool 参数含 `anyOf` union | `200` |
| 5 | tool 参数某属性为 `{}`（= TypeBox `Unknown()` 编译形态） | `400 Failed to parse request body` |
| 6 | `additionalProperties: {}`（= `Type.Record(String, Unknown())` 编译形态） | `400 Failed to parse request body` |
| Spherse App 空白会话原文 | — | `400 Request contains an invalid argument.` |

解读：
- 1–4 通过 → key/连通性/模型存在/流式/system/temperature/strict/union 全无问题。
- 5–6 必现 400 → 该中转 Gemini 适配器拒绝 tool 参数中的**无类型空 schema 节点**。
- Spherse 报错 message 与 5/6 不同（`Request contains an invalid argument.` 是 Google Gemini 上游 `INVALID_ARGUMENT` 原话），说明中转至少有两层校验：解析层（报 `Failed to parse`）与上游透传层（报上游原话）；Spherse 的完整请求过了第一层、挂在第二层。

## 4. Spherse 侧代码链路（为什么每次都带 `{}`）

1. **源头**：`packages/core/src/capabilities/data/tools.ts:83`（`query_data.params`）、`:120`（`mutate_data.args`）用 `Type.Record(Type.String(), Type.Unknown())`；MCP schema 转换兜底同样产 `Type.Unknown()`（`packages/core/src/mcp/json-schema-to-typebox.ts:59,65,69,106`）。
2. **无条件注册**：`packages/core/src/capabilities/data/capability.ts:8-26` 的 `dataCapability()` 每次注册 `read_data/query_data/mutate_data`，不检查项目有无数据文件。
3. **会话装配**：`packages/core/src/session/agent-assembly.ts:161-171` 按 `profile.tools` 从 capability map 取 tool；出事 agent 的 `profile.md` frontmatter `tools` 明确包含 `query_data`、`mutate_data`（另有 `ask_user` 等 15 个）。→ **该会话每次请求的 tools 数组必含 `additionalProperties: {}` 节点。**
4. **发送**：自定义供应商固定 `api: "openai-completions"`、无 `compat` 覆盖（`packages/core/src/model-providers/catalog.ts:132-154`）；pi-ai 对未知 baseUrl 走默认 compat（`supportsStrictMode` 为 true，非 Moonshot/Together 等排除项，见 `pi-ai/dist/api/openai-completions.js:1306`），`convertTools`（`:1146-1173`）按 OpenAI 格式（含 `strict`）发出，`{}` 节点原样保留。
5. **回流**：pi-ai `normalizeProviderError/formatProviderError`（`pi-ai/dist/utils/error-body.js`，status+body 上限 4000 字符）→ pi-agent-core `handleRunFailure` 塞入 assistant 消息 `errorMessage`（`pi-agent-core/dist/agent.js:349-364`）→ Spherse `agent-runner.ts:493-499` 落盘 `assistant/message` 事件 → UI。
6. **request ID 缺失原因**：pi-ai 归一化只保留 status+body，不保留响应头；该中转 body 不带 request id（响应头有 `X-Request-Id`，但到不了客户端错误对象）。Anthropic 系 body 自带 `request_id` 是例外。

## 5. 根因判定（分级）

- **Confirmed**：中转 Gemini 路由拒绝含 `{}` 的 tool 参数（curl #5/#6 必现）；Spherse 该会话必发此类参数（§4.1–4.3）。
- **Highly likely**：“之前没问题”是中转侧 OpenAI→Gemini translator 变严格（外部变更）；同站 GPT 路由正常是因为 OpenAI 原生上游容忍 `{}`。
- **Open（待实锤）**：失败请求原文中具体是 `query_data`、`mutate_data` 还是其他 tool（含 `ask_user` 复杂嵌套）触发——Spherse 无外发请求体日志，无法直接确认。实锤方法见 §7。

## 6. 修复选项

### A. 发送前清洗 tool schemas（推荐，Spherse 侧根治）

在 `ModelCatalog.getChatStreamFn`（`catalog.ts:317-326`，唯一 choke 点，有 `model` + `context.tools`）或 `composeStreamFn`（`agent-assembly.ts:32-44`）包一层：递归遍历 tools parameters，把无类型节点（`{}`、无 `type`/`$ref`/`enum`/`const`/`anyOf`/`oneOf`/`allOf` 的 object）替换为 `{"type":"string"}` 或剪除。

难点是**目标判定**：自定义供应商只有 id/name/baseUrl，Spherse 无法可靠知道上游是 Gemini 还是 OpenAI。子选项：

- A1：model id / provider id 启发式（含 `gemini` 关键字才清洗）——零配置，但脆弱（中转站爱改名，如 `[反重力次]gemini-3.8-flash-high` 这种带前后缀的可 match，纯别名则不行）。
- A2：自定义供应商加兼容开关（如 `schemaMode: strict-openai | gemini-safe`），UI 在添加自定义供应商时可勾选——精确但加配置面。
- A3：无条件清洗——需先证明对 OpenAI strict 模式无害（`{}`→`{"type":"string"}` 后仍需满足 strict 的 required 全覆盖，不变量要在单测里钉住）。

### B. 源头收敛（不彻底，只能做一部分）

- `query_data.params` / `mutate_data.args` 的动态参数本质上就是 free-form，静态定型不可能；能做的是把 `Unknown()` 换成有类型的宽松 schema（如 `{"type":"string"}`）——但这会**撒谎**（实际可传任意 JSON），且改了所有供应商共用的 tool 定义，治标不治本。
- MCP 转换兜底 `Unknown()` 同理。结论：源头修只能减少 `{}` 出现面，不能替代 A。

### C. 中转侧反馈（用户可执行，Spherse 控制外）

报“Gemini 路由对 tool 参数空 schema 报 400，以前透传正常”，附 curl #5 最小复现。店家放宽 translator 即可恢复。

### D. 补诊断能力缺口（建议顺手做）

Spherse 无外发请求体日志，本次定位全靠外部 curl 二分。建议加 debug 开关：记录外发 payload 的 tool 名列表 + parameters 摘要（hash/长度/是否含空节点，**不记完整 system prompt 与消息原文**，注意隐私），否则下次同类问题依然只能盲猜。

## 7. 验证计划（立项后执行）

1. 实锤：临时日志或按该 agent tool 列表二分 replay，确认触发 tool（§5 Open 项），再动手修，避免修偏。
2. 单测（core）：sanitizer 纯函数测试——含 `{}`/`additionalProperties:{}`/嵌套空节点输入 → 清洗后无空节点；不变量：无空节点输入原样返回；OpenAI 目标行为不受影响（与现有 `session/*`、`model-providers/*` 测试同跑）。
3. 真实验证：curl 矩阵重放 + App 内同会话发送成功；回归 `npm run verify` 相关包。
4. 文档同步：按 doc-sync skill 检查（本 analysis 已是落盘第一步；修完后同步对应包 README/官方域文档如有涉及）。

## 8. 修复方案（A2：自定义供应商兼容开关，已立项）

自定义供应商上的可选开关，默认关，存量配置零迁移。勾选后发送前只清洗该供应商的 tool JSON schema。

### 开关形态

`CustomProviderDef.sanitizeEmptySchemas?: boolean`。缺省/`false` 时 omit 该字段（与 `headers` 一样）；UI 在 `CustomProviderDialog` 里仿 `keyless` 加 Switch；用户修好后需手动打开出事供应商那项。contracts 无 customProviders schema，不改。

### 清洗规则（纯函数，core）

新文件 `packages/core/src/model-providers/sanitize-empty-schemas.ts`，只改 payload 的 `tools[]`，对每个 `function.parameters` 递归：普通空对象 `{}` → `{ type: "string" }`（对应 TypeBox `Unknown()`）；`additionalProperties: {}` 自然变成 `{ type: "string" }`（对应 `Record(String, Unknown())`）；已有 `type`/`anyOf`/`$ref` 等的节点原样递归子树；非 object 不动；不碰 `messages`/其他字段；无改动返回原对象。

### 接入点

`ModelCatalog.getChatStreamFn`（已有 `onPayload` 先例 `injectTopP`）：用 `model.provider` 查 `registeredDefs`，flag 开才挂 sanitizer `onPayload`，与 `injectTopP` 组合为 sanitize → topP；两者都无仍不挂 `onPayload`。`syncCustomProviders` 整表重建，设置保存即热生效。

### 不做

不改 `query_data`/`mutate_data`/MCP 的 TypeBox 定义；不做 model id 启发式（A1）；不加请求体日志（D）；实现后只按 doc-sync 补 `architecture/desktop.md` 一行字段说明。

## 9. 取证（2026-09-14 20:11，小助手会话 `795284bd-…`）

dump 文件 `%TEMP%\spherse-payload-debug.jsonl` 第 0/1 行与 DB error 时间对齐（20:10:59 发、20:11:02 落 400）。

| 项 | 事实 |
|---|---|
| agent | `assistant-acb0db`，22 个 tool |
| provider/model | `xxxx` / `gemini-3.8-flash` |
| `sanitize` | **true**（开关已生效，不是 start-dev 热更/环境问题） |
| 空 `{}` | 已清掉。`query_data.params`/`mutate_data.args` 变成 `patternProperties.^(.*)$: {type:string}`（TypeBox `Record` 形态，sanitizer 只替换了内层 Unknown） |
| 其它 payload | `stream:true`、`stream_options.include_usage`、`store:false`、`max_completion_tokens:115856`、system ~22k |
| UI 报错 | `400: {"message":"The request could not be processed. Please check the request parameters.","type":"invalid_request_error"}` |

curl 原样重放（同 key、同 dump）：

- 生产形态（stream true + 全字段 + 原 messages + 22 tools）：之后多次 **200**
- 仅把 dump 改成 `stream:false` 曾 **一次**打出与 UI 完全相同的 400 文案，随后同请求又 200
- 连接被对端掐断也出现过一次（`Remote end closed connection without response`）

结论：这次 400 **不是** sanitizer 没跑，也 **不是** 环境/热更；确定性空 schema 已排除。残留 400 是中转渠道池不稳定（同一 body 时 400 时 200）。Spherse 侧仍有「严格 Gemini translator」风险点：`patternProperties`、`anyOf`/`const`、`store:false`、过大 `max_completion_tokens`——当前渠道多数放行，切到严渠道会回到 `invalid argument`。

## 10. 收尾（2026-09-14）

- A2 已落地：`CustomProviderDef.sanitizeEmptySchemas` 开关 + `sanitize-empty-schemas.ts` 清洗 + `getChatStreamFn` 接入 + Dialog UI + 三语言文案；core 23、Dialog 13、desktop settings 47、i18n 10 单测全过，lint/typecheck（core/app/desktop）全过。
- 临时取证日志（`catalog.ts` 内 `SPHERSE_DEBUG_PAYLOAD`，`%TEMP%/spherse-payload-debug.jsonl`）已删除并重建 core dist；确诊结论如 §9，不再保留。
- 版本 bump 到 `0.3.3-alpha`（仅 `packages/desktop/package.json`，沿 9247b89 惯例）。
- 用户侧启用：在自定义供应商 `custom-tokenshop-gemini` 打开「兼容严格 schema」后保存（`syncCustomProviders` 热生效，需重启主进程）。
