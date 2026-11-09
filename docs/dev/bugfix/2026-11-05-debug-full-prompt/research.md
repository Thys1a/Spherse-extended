# 调试工具显示完整 prompt：调研

- 日期：2026-11-05
- 状态：已调研，待立项（推荐分两步：先接线已有快照 → 按需补 wire 真值；不做落库）
- 需求：调试工具（目前只有 DebugMenu → turnContext 事件列表）显示发出去的完整 prompt，现在仅可见用户消息级别摘要。

## 一、结论摘要

`getTurnContext()`（`core/session/agent-runner.ts:462-504`）已能即时算出 systemPrompt 全文＋投影后 messages＋tools 全量，纯内存按需计算；`GET .../debug/turn-context` 端点已打通但前端只用来下载 JSON。第一步只需做 UI 接线＋补 3 个 schema 可选字段（model/thinkingLevel/sampling），约 4 文件，零运行时开销。逐字节 wire 真值需要再包一层 `streamFn` 捕获（只留内存最近 1 次）。不新增落库 debug 事件（DB 体积＋migration＋隐私三重代价）。

## 二、现状（file:line 实证）

- 入口：`DebugMenu`（activity-bar 虫子图标，`features/debug-tools/DebugMenu.tsx:68-115`），仅 `isDev || debugToolsEnabled` 渲染；相关项只有 Streaming Log 与 `turnContext`（`:92-105`），无独立 Chat Debug 视图。
- `TurnContextDialog.tsx:100-151` 是事件列表：`client.getSessionEvents` → `EventLogRow` 折叠行（`seq + type + eventPreview`，`event-log-display.ts:82-108` 只提用户消息 96 字/tool 名/stopReason），展开也只是单条落库事件 JSON——看不到 systemPrompt、投影后 messages、工具定义。
- 快照下载按钮（`TurnContextDialog.tsx:79-98`）：`client.getTurnContext()` → 存文件，不渲染。**数据能拿到，只没接线。**
- 数据源：会话事件 `GET .../debug/sessions/:id/events`（`server/routes/debug.ts:18-31`，有 DB 回退）；快照 `GET .../turn-context`（`:7-13`，纯内存，无 DB 回退，session 未打开抛错）；contracts（`contracts/debug.ts:1-36`，`turnContextSnapshot{sessionId,capturedAt,systemPrompt,messages,tools}`，**无 model/thinking/sampling 字段**）；Streaming Log 只是 pino 截断行（`core/session/log-agent-event.ts:12-73`，`TRUNCATE_LIMIT=500`），与 prompt 无关。

## 三、"完整 prompt"的构成与组装点

一次 LLM 调用输入 = 5 层叠加：

1. **systemPrompt**：`agent-assembly.ts:137-201` `buildPromptAndTools`（project-instructions → agent-profile → session-context → preloaded-context → 各 capability `contextBlocks`，`serializeBlocks` join）。
2. **contextProjectors**：`agent-assembly.ts:236-255` `convertToLlm` 内组合（attachments / worldbook / state / tool-output-budget），角色过滤后输出。
3. **streamDecorators + previewTransforms**：洋葱圈（`agent-assembly.ts:32-44,68-84`）；`previewTransforms` 全库仅 time-prefix 一个（`time-perception/index.ts:11-15`），只回放 message 改写，不回放工具改写（如 web-search 摘 tool）。
4. **模型/采样参数**：`buildAgent`（`:218-256`，model/thinkingLevel/tools）＋ `catalog.ts:318-340`（temperature/topP/maxRetries/headers）。
5. **wire 形态**：pi-ai `Message[]` + systemPrompt + tools schema。**目前没有任何一处把这个完整组合序列化存下来。**

落库视图 vs wire 视图：`agent.state.messages` 平时就是 fold 折叠后视图（`fold.ts:50-75`，digest 替换 anchor 前全部消息；`agent-runner.ts:923-927`），`getTurnContext()` 展示的是"落库折叠后＋投影后"的 wire 近似（缺 decorator 工具改写与采样参数），不是逐字节真值。

## 四、可复用基础设施

- `getTurnContext()`：systemPrompt 全量＋投影后 messages＋tools 全量；内存即时计算，不落盘；未打开的 session 调不到（对比 events 有 DB 回退）。
- `TurnContextSnapshotContract`：三件套已有，前后端 parser 打通，加字段只改 `contracts/debug.ts` + `core/session/types.ts`。
- `sessions.db`：全量落库事件永久保存（systemPrompt、投影、附件原图消毒后缺失都不在里面），是"原料"而非"成品"。
- WS 流式事件（`message_update` 等）只转发不落库（`chat-channel.ts:305-310`）；`event-log.ts` 持久化翻译只收 `message_end/agent_end`。

## 五、方案对比

|  | 改动面 | 代价 | 保真度 |
|---|---|---|---|
| A 复用快照＋前端展示＋补 3 字段 | contracts+core types+runner 取数+对话框（约 4 文件） | 按需计算，无增量；本机传输，与现有下载同级 | 落库投影近似 |
| C-lite 包 `streamFn` 捕获最近 1 次 | assembly+runner+reload 路径（注意 `applySampling/applyReload` 重建别丢包装） | 内存 ring cap=1，不落盘 | wire 真值 |
| B 单包 `convertToLlm` | 被 C 覆盖，不做 | — | — |
| D 新增落库 debug 事件 | events+fold+store+migration+contracts（≥5 文件＋兼容负担） | 每次调用全量 prompt 进 DB，体积爆炸；敏感信息永久落盘 | 不做 |

## 六、推荐与验收

1. **Step 1（本期）**：`TurnContextDialog` 页内展示（System / Messages / Tools 三区＋顶部 `capturedAt + model/thinkingLevel/sampling` 参数头），UI 标注"fold＋投影后视图"。验收：看到与本次 turn 一致的 systemPrompt 全文＋messages 逐条＋tools schema，且与下载 JSON 一致；E2E 只覆盖"端点字段存在＋对话框渲染不崩"。
2. **Step 2（按需）**：C-lite，真 wire 对账用；`?includeWire=true` 或同一快照端点返回。
3. 快照离线查看（按 events 重放 fold＋投影的纯函数化）暂不做，等"查历史 turn 发了什么"的真实需求出现。
