# 对话 token 数据 + 输入框预计 token 展示：方案

- 日期：2026-10-18
- 状态：有方案，待评审
- 版本：v1.0.1
- 来源：`docs/dev/investigation/2026-10-06-cross-project/09-token-usage-feasibility.md`（结论可行，建议先做 A1 + B1；分项定义与优先级见该文档）+ 本次代码现状核查（只读，未改代码）

## 一、结论摘要

1. 数据层全通：每轮 `usage` + `promptEstimate` 已落 `assistant/message` 事件，`sessionStatus` contract + `GET …/status` + `getSessionStatus` 全链路可用，只缺 renderer 的 query hook 与刷新。
2. UI 层零展示：聊天内无任何 token 元素；唯一用量 UI 是会话列表右键的 `SessionStatusDialog`（渲染逻辑可复用）；正常轮次 usage 在投影层被 error-only 门丢弃。
3. 估算层：core 有 CJK 启发式（`token-estimate.ts`），但 renderer 不运行时引用 `@spherse/core`（app 侧现全为 `import type`，core 带 better-sqlite3 等原生依赖，打进 renderer 会炸包；已决策：app 侧镜像 + 对比测试，见 §三）。
4. 路径（2026-10-19 修订）：app 镜像 `estimateTokens`（`features/chat/lib/estimate-tokens.ts` + 与 core 同名函数逐值 parity test；先例 `settings/custom-provider-defaults.ts`；别引 pi-ai 估算器，CJK 更差且越包边界）→ 补 `useProjectSessionStatus` → 聊天内上下文 pill（显示 `currentTokens`/`contextWindowLimit`，A1；`turn_end`/`agent_end` 失效重取）→ `Composer` 输入计数（B1）→ 放宽投影门 + `AssistantBubble` 正常态渲染（A2）；范围 A1 + A2 + B1，B2/A3 不进 v1.0.1。

## 二、现状（file:line 实证）

- 采集：`core/session/agent-runner.ts:838-846`（`assistant/message` 带 `usage` + `promptEstimate`）；发送前三处估算 `:275-278`、`:342-345`、`:623-631`，压缩预检 `:794-804`。
- 聚合：`core/context/token-estimate.ts:85-91`（`readCurrentTokens`）、`core/session/status.ts:46-58`（`computeSessionStatus`）、`session-manager.ts:251-268`（`getSessionStatus` 在离线双路径）。
- 接口：`contracts/src/sessions.ts:82-85`（`sessionStatus`）、`server/src/routes/sessions.ts:146-158`、`app/src/lib/api.ts:711-717`（`getSessionStatus`，另透出 UI SDK `sessions.status`）。
- UI：`Composer.tsx:308-319` 仅 `SessionModelPill`（纯模型切换，无 token）；`SessionStatusDialog.tsx:102-133` 数字 + 进度条（入口 `SessionRow.tsx:206-207` 右键，聊天页不挂载）；`chat-tool-projection.ts:87-102` 正常轮次 diagnostics 被丢弃，仅 error 经 `AssistantBubble.tsx:175-182` 显示。
- 估算：`token-estimate.ts:11-32`（CJK 启发式）+ 单测；renderer 不运行时引用 core（见 §一），app 侧镜像 + parity test。

## 三、方案

1. app 新增 `features/chat/lib/estimate-tokens.ts` 镜像 `estimateTokens`（纯函数零依赖；`__tests__` 或同目录 test 逐值对比 core 同名函数；别引 pi-ai 估算器，CJK 更差且越包边界）。parity 测试需从 core 导入同名函数，故 `core/src/index.ts` 顺带导出（renderer 仍用镜像，不运行时引用 core）。
2. app 新增 `useProjectSessionStatus`（`queries/project/sessions.ts`，补 `projectQueryKeys.status`），`turn_end`/`agent_end` 后失效重取（`runtime/session-store.ts`、`hooks/useChatSession.ts` 现均无 status 逻辑；UI SDK `sessions.status` 双端口径保持一致）。
3. 聊天内上下文 pill（`Composer`/`SessionModelPill` 旁，显示 `currentTokens` + `contextWindowLimit`；`SessionStatusDialog` 自带 fetch/reducer/弹窗外壳不可直接复用，先抽 `SessionTokens` 纯展示组件给两处共用）。
4. `Composer` 输入 `useMemo` 计数（纯文本估算，标注“预计”）。
5. 放宽 `extractAssistantExtras` 投影门 + `AssistantBubble` 正常态渲染（当前仅 `error && diagnostics` 显示，见 `AssistantBubble.tsx:175-182`），让正常轮次 usage 到达并显示每轮角标（该轮 prompt/output；A2 进本期，B2 模型窗占比不做）。
6. i18n：`session.status*` 仅覆盖弹窗，补聊天侧文案（走 i18n skill）。

## 四、已决策（2026-10-18）与口径解释

- 范围：A1（上下文 pill）+ A2（每轮角标）+ B1（输入框预计）；A3（WS 实时推送）与 B2（模型窗占比）不进 v1.0.1。
- 口径解释（三个数本来就是三件事，不可能相等）：
  - ① 会话累计 `currentTokens`：由 `usage.totalTokens` 来，**含模型输出**，是“到现在一共花了多少”。
  - ② 本轮输入 `promptTokens`：`input + cacheRead`，**不含输出**，是“这一轮发出去多少”。
  - ③ 输入框草稿估算：还没发送的纯文本，用启发式估的，是“将要花多少（预计）”。
  - 所以 ① 最大（含输出），② 是已发送输入，③ 是未发送草稿——三处 UI 各显示各的数，不强求一致。
- 建议映射（已定 2026-10-19）：pill（A1）显示 ① + 窗口上限（零契约改动；`sessionStatus` 无 promptTokens 字段）；会话弹窗保留 ①（累计用量）；输入框计数器（B1）显示 ③ 并标注“预计”；每轮角标（A2）显示该轮的 ②/输出（诊断链已有 `promptTokens`）。

## 五、测试

- hook：`useProjectSessionStatus` 拉取 + `turn_end` 后重取；离线 `computeSessionStatus` 路径已有覆盖，复用。
- UI：pill 渲染数字/进度；输入计数随输入变化；投影放宽 + 正常态渲染后 diagnostics 到达。
- 镜像一致性：app 估算与 core 同名函数逐值对比测试。
- i18n：`npm run check:i18n`。
- 真机：pill 数字随轮次更新；角标；输入计数；移动端窄屏。

## 六、范围与不做

- 不改 `usage` 采集与落库格式；不做服务端推送（先用失效重取）；不引 pi-ai 估算器；renderer 不运行时引用 `@spherse/core`（打包边界）；不改 contracts（`sessionStatus` 字段不变）；向量/语义相关一概不碰。
