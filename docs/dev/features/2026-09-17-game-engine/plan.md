# Implementation Plan: 游戏引擎方向（game-engine�?
- 日期�?026-09-17
- Design：`design.md`（同目录；代码实�?+ 锁定决策 + 分域方案，本文不重复 rationale，只�?what/how/verify�?- 需求：`docs/dev/investigation/2026-09-17-game-engine/requirements.md`（E1–E7�? 个开放问题已拍板�?- 范围：Phase 1（P0 最小可用：R1.1 + R2.1/R2.2�? Phase 2（R1.2、R2.3/R2.4、R2.5a、R3.2、R4.1/R4.2、R7.1–R7.3）。Phase 3（R1.3 文档化、R1.4、R2.5b、R6.x、E5）另立项，不在本文�?- 模式：按依赖顺序执行，每�?Task 独立可验证；完成即在标题行标�?`[x]`

## 任务依赖�?
```
T1 R1.1 schema+types+version:2 ──�?T2 validate 递归+outline ──�?T3 测试+回归
                                                        �?T4 R2.1 装配路径 ──�?T5 三处埋点 ──�?T6 R2.2 放行+反伪�?──�?T8 R2.3 表单放行
      �?                                                       �?      �?                                                       �?      �?                                             T9 R2.4 深度计数
      �?      └────────�?T10 R2.5a 归因 ───�?T11 R3.2 联动刷新
                     �?T12 R4.1 钩子 ──�?T13 R4.2 config ──�?T16 doc-sync+verify
                     �?T14 R7.1 匹配+注入 ──�?T15 R7.2 预算+R7.3 顺序
                     �?              T7 R1.2 诊断（依�?T1，不阻塞他项�?```

## 共享类型契约（各 Task 以此为准，勿自行变形�?
```ts
// ManifestFieldRule 嵌套扩展（L1 上限，手写类型；dataManifestSchema 无运行时消费者，仅作声明�?interface ManifestFieldRule {
  type: "string" | "integer" | "number" | "boolean" | "enum" | "object" | "array";
  values?: string[];
  required?: boolean;              // 标量必填
  default?: unknown;
  desc?: string;
  properties?: Record<string, ManifestFieldRule>;  // type="object" �?  items?: ManifestFieldRule;                       // type="array" �?  required?: boolean;              // 标量与嵌套统一布尔语义（对象属性必填即子规�?required: true，无 requiredFields�?}
// version: 1 纯标量自动兼容；�?object/array 即要�?version: 2

// FileChangeEvent（统一 data/card/文件/memory/trigger 归因�?interface FileChangeEvent {
  file: string;
  version?: string;
  origin: "sdk" | "agent";
  sessionId: string;
  turnSeq: number;                 // turn/start �?seq
  toolCallId: string;
  summary?: string;                // �?data mutate 有（mutation 名）
  type: "data" | "card" | "write" | "edit" | "memory" | "trigger";
}

// sp: 三事�?payload
type TurnEventPayload = { sessionId: string; agentId: string; seq: number; reason?: string };
// 事件名：sp:user-message / sp:assistant-message / sp:turn-end

// worldbook 注入�?// kind="worldbook"，追加于 skill-catalog 之后；position 首版忽略
```

- `set` 对嵌�?object 整叶替换；数组走 `append/update/remove`，`set` 不做元素�?patch�?- 校验错误路径点分拼接（如 `party.members[2].hp`），仅为明细 key，不经过 `dot-path` 解析�?- `parseManifest` 签名不动；诊断走新增 `parseManifestWithDiagnostics` + `ManifestHealth.diagnostics` 可选字段�?
---

## Task 1: R1.1 schema + types + version:2 [x]

**依赖**：无�?
**改动文件**�?- `packages/core/src/capabilities/data/manifest.ts` [修改]：`types.ts` 接口扩展（手写类型；`manifestFieldRuleSchema` TypeBox 声明不动——无运行时消费者）；`parseManifest :57` 拒收改为 `version > 2`；`MANIFEST_SUPPORTED_VERSION :52` 同步改为 2；`version: 1` 旧文件自动兼容分支；**`version: 1` �?object/array 字段 �?拒绝**（旧 parser 不得静默放行嵌套�?- `packages/core/src/capabilities/data/types.ts` [修改]：`ManifestFieldRule :72-78` 同步扩展；`ManifestHealth :101-110` 加可�?`diagnostics`（供 T7，结构先行）
- `packages/core/src/capabilities/data/data-store.ts` [修改]：`set` 嵌套整替语义保持（浅合并即整叶替换，加注释说明，不改逻辑�?
**测试**：schema 形状单测（object/array 声明通过；非�?type 拒绝）；`version: 1` 含嵌套字段被拒绝�?
**验证**：`npm test --workspace=packages/core -- --grep manifest`（或对应测试文件）�?
---

## Task 2: R1.1 validate 递归 + outline 展示 [x]

**依赖**：T1�?
**改动文件**�?- `packages/core/src/capabilities/data/validate.ts` [修改]：`checkValueType :6-21` �?object/array 递归分支，错误路径点分拼接；未知字段在嵌套层同样拒绝
- `packages/core/src/capabilities/data/outline.ts` [修改]：`formatEntrySignature :87-96` 递归展示（如 `members!: {hp!, level?}[]`；嵌套层沿用顶层�?标记惯例，数组标量元素显示类型如 `tags?: string[]`�?
**测试**（同 data 测试目录，仿既有模式）：
- 嵌套合法值通过；非法值抛 `DataValidationError` 附正确字段路�?- 数组缺必填元素；深路径错误（`party.members[2].hp: expected integer`�?- outline 嵌套展示渲染正确

**验证**：`npm test --workspace=packages/core` 相关用例全绿�?
---

## Task 3: R1.1 端到�?+ version:1 回归 [x]

**依赖**：T2�?
**改动文件**：无（测试为主；�?`spherse-build-data-app` skill 需声明嵌套示例则改 skill 文档）�?
**测试**�?- `mutate_data` 端到端：声明「队伍→成员数组→hp/level」并写入成功
- 旧文�?`version: 1` 回归：纯标量 manifest 行为不变
- `set` 整替语义单测：嵌�?object 被整叶替换；数组只能走三件套

**验证**：`npm run verify` 相关包（core + presets skill 同步检查）�?
---

## Task 4: R2.1 装配路径 [x]

**依赖**：无（与 T1–T3 并行）�?
**改动文件**�?- `packages/core/src/session/runtime.ts` [修改]：`RuntimeDeps :39-51` �?`onTurnEvent?: (e: {name, payload}) => void`
- `packages/core/src/factory.ts` [修改]：late-binding 接线——`createRuntimeDeps :98-106` �?`TriggerManager` 尚未创建（其�?capability `init :119-129` 中惰性构造），故�?`capabilities` 数组（`:88-91` 已就绪）中按 `id === "trigger"` �?capability，注�?lazy 闭包 `(e) => triggerCap.manager.onInternalEvent(e)`；回调只�?turn 期触发（init 之后），getter 不会提前抛错
- `packages/core/src/trigger/trigger-manager.ts` [修改]：新�?`onInternalEvent(eventName, payload)`，与 `onTimeTick`/`onUserEvent` 并列�?*共用私有匹配函数**（不直调 executor�?- 重入策略：`existing_session` 指回同一 session 时撞 `ensureNotBusy`（`agent-runner.ts:295-301`）——`sp:` 订阅触发同会话时跳过或排队，二选一落定（推荐排队，日志可观察）

**测试**：装配单测（factory 产物含接线；�?manager 时回调空安全）�?
**验证**：`npm test --workspace=packages/core` 相关用例�?
---

## Task 5: R2.1 三处埋点 + 过滤 [x]

**依赖**：T4�?
**改动文件**�?- `packages/core/src/session/agent-runner.ts` [修改]�?  - `:175` �?emit `sp:user-message`（payload `{sessionId, agentId, seq}`�?  - `appendMessageEvent` �?`assistant/message` 分支�?emit `sp:assistant-message`（toolResult 轮不 emit�?  - `:479` turn/end �?emit `sp:turn-end`（payload �?`reason: completed|error|aborted`�?  - `:242` retry �?emit `sp:user-message`（只�?`sp:turn-end`，reason 沿用 completed/error/aborted 三值）

**测试**�?- 三事�?emit 次数单测（user�?；assistant�?；turn end�?�?- toolResult 密集轮不 emit `sp:assistant-message`
- retry �?emit `sp:user-message`

**验证**：core 单测全绿�?
---

## Task 6: R2.2 放行 + WS 反伪�?[x]（消费侧完成；`sp:` 订阅可配置待 T8，R2.2 整体�?partial�?
**依赖**：T5�?
**改动文件**�?- `packages/core/src/trigger/trigger-manager.ts` [修改]�?*保留** `:74` 首行 `sp:` 守卫（纵深防御）；新�?`onInternalEvent` �?`onUserEvent` 共用私有匹配函数（抽�?`:77-85` �?`fireMatching(eventName, payload)` 供两者调用）
- `packages/server/src/bus/ws-bus.ts` [修改]：`:94` 处静默拒绝外�?`sp:` emit（debug 日志，不回包）；内部 `onInternalEvent` 不受影响
- contracts `bus.ts` [按需]：`emit-trigger-event` schema 注释说明 `sp:` 禁止（parser 校验�?server 侧）

**测试**�?- `sp:assistant-message` 订阅实际 fire（Phase 1 走直�?store 脚手架：测试内直接写 trigger store，绕�?`manage-trigger` �?`sp:` 拒绝——该拒绝�?T8 才放行）
- 抽测�?session 模式（new/existing/reusable�? 审批语义沿用
- **WS 伪�?`sp:` 被拒**单测
- 10 分钟 cron 回归

**验证**：`npm test --workspace=packages/core` + `--workspace=packages/server` 相关用例�?
---

## Task 7: R1.2 非法条目可诊�?[x]

**依赖**：T1（不阻塞他项，可并行）�?
**改动文件**�?- `packages/core/src/capabilities/data/manifest.ts` [修改]：新�?`parseManifestWithDiagnostics`（收�?`{name, reason}`；存�?`parseManifest` 签名不动�?- `packages/core/src/capabilities/data/data-store.ts` + `tools.ts` [修改]：`read_data` outline 附诊断；`mutate_data` 未知 mutation 错误文本附诊断（�?`mutations.hp_curve: op must be one of append/update/remove/set`�?
**测试**：坏条目示例（非�?op / �?path / `auto` 误用）产生正确诊断；outline 含诊断信息�?
**验证**：core 单测�?
---

## Task 8: R2.3 表单放行订阅 [x]

**依赖**：T6�?
**改动文件**�?- `packages/app/src/features/agent-trigger/TriggerForm.tsx` [修改]：`:79-89` 事件名输入改为下拉（�?`sp:user-message` / `sp:assistant-message` / `sp:turn-end` + 说明，保留自定义输入�?- `packages/core/src/tools/manage-trigger.ts` [修改]：`validateShape :110-121` 放行 `event_name: sp:*` 的订阅创建（emit �?`emit-trigger-event.ts:40-50` 禁令保留�?- `packages/contracts/src/trigger.ts` [修改]：`eventName` schema 注释同步

**测试**：表单组件测试（下拉含三项）；`manage-trigger` 创建 `sp:` 订阅通过、emit 仍拒绝；`isReservedEventName`（`validation.ts:14`）引用检查——放行订阅后确认仅剩 emit 侧使用，无死代码�?
**验证**：core + app 相关测试�?
---

## Task 9: R2.4 链深度计�?[x]

**依赖**：T6�?
**改动文件**�?- `packages/core/src/trigger/executor.ts` [修改]：`fire :50-56` �?`opts?: {depth, chainId}`（payload 保持模板字符串）；超限（�?5）记 trigger 日志并停；A→B→A 乒乓�?chainId 识别
- `packages/core/src/kernel/ports.ts` [修改]：`SendMessageOptions` 加透传字段 `triggerDepth?` / `triggerChainId?`
- `packages/core/src/session/agent-runner.ts` [修改]：埋点透传当前 turn �?depth/chainId（配�?T5 �?`emitTurnEvent`�?
**测试**：深�?0�? 正常、第 6 层被拒（日志可观察不抛错）；�?chainId 乒乓被去重拦截�?
**验证**：core 单测�?
---

## Task 10: R2.5a 归因补齐 + withdraw 语义文档�?[x]

**依赖**：T5（需 turnSeq 来源）；�?T8/T9 可并行�?
**改动文件**�?- `packages/core/src/capabilities/data/types.ts` [修改]：`DataChangeEvent :1-8` 改名或扩展为 `FileChangeEvent`，加 `sessionId/turnSeq/toolCallId/type`（turnSeq �?`turn/start` �?seq�?- `packages/core/src/session/agent-runner.ts` [修改]：归因传递机制——用 `beforeToolCall`（pi-agent-core `AgentOptions`，`BeforeToolCallContext` �?`toolCall + args + context`）建 `Map<toolCallId, {sessionId, turnSeq}>`�?*并行安全**：`toolExecution` 默认 `"parallel"`，禁止单�?ambient 变量），`afterToolCall` 清理条目；`persistMiddleware` �?`tool/result` 时按 toolCallId 查映射填 `sideEffects: {type, file, version?}[]`
- `packages/core/src/capabilities/data/data-store.ts` [修改]：`mutate/rawSet/rawDelete` �?opts 加可选归因字段（`{toolCallId}`），经映射查 turnSeq 后填入事件；store 本身不感�?turn
- `packages/core/src/capabilities/card/` [修改]：四写操作加同构 change event（card-store + types），�?opts �?data 透传 `toolCallId`
- `packages/core/src/tools/write-file.ts`、`edit-file.ts`、`store/memory.ts`、`trigger/trigger-manager.ts` [修改]：写�?触发时填归因（memory/trigger �?file 字段按各自语义：memory 条目 id / trigger entry 文件�?- contracts [修改]：`tool/result` schema 加可�?`sideEffects`
- `packages/core/src/session/session-manager.ts` [修改]：新�?`listSideEffectsByTurn(sessionId, turnSeq)`（遍�?event log 合并 `sideEffects`�?- 文档：skill + 用户可见说明写明 withdraw = 截断不回滚（与本 Task 同批�?
**测试**�?- data/card/write_file 写入后事件含正确归因三字�?- `listSideEffectsByTurn` 返回�?turn 全部写入
- 端到端：event log �?`tool/result.sideEffects` 可观�?
**验证**：core 单测 + contracts 契约测试�?
**实现注记（与上文偏离，以实现为准�?*�?- 清理点由 `afterToolCall` 改为 `message_end` �?drain（实�?hook 顺序：afterToolCall 先于 message_end；blocked/immediate 路径同样覆盖）�?- 归因字段可选（sdk-origin 裸写�?turn 可归因）；registry �?`(sessionId, toolCallId)` 双键作用域�?- `sideEffects` 覆盖边界：mutate_data/edit_card/write_file/edit_file/memory_save/emit_trigger_event/manage_trigger/create-update-delete-reset/copy_file/move_file/generate_image/append_changelog；run_command/manage_agent/manage_project_config 因目标不可解析不在列�?- write/edit/memory/trigger 侧由 runner �?tool result details 派生（未改工具签名）；用户可�?withdraw 说明暂无对应 UI 文案位置，仅 skill 注记�?
---

## Task 11: R3.2 data 联动重渲�?[x]

**依赖**：T10（卡片的 data 依赖来自 `sideEffects` 反查，此依赖为实线；host �?`file:update` 本身无新增）�?
**改动文件**�?- `packages/app/src/features/chat/HtmlCard.tsx` [修改]：`46` 附近新增 `file:update` 订阅（目�?`.data.json` 路径精确匹配），变更后重取关�?query 并重渲染；加卸载清理
- 浮窗侧：`FloatingContentBrowserContainer.tsx` 同构订阅（现仅自身文件变化刷�?`:29-31`�?- host 侧零新增（`use-event-bridge.ts:20-24` 已覆盖）

**测试**�?- 可数行为：连�?10 �?mutate 重渲�?≤N 次且无报错（N 实施时定�?- 卸载清理单测（session 切换无泄漏）

**验证**：app 单测 + 手测�?00/min 配额说明）�?
---

## Task 12: R4.1 新主题钩�?[x]

**依赖**：无（可全程并行）�?
**改动文件**�?- `packages/app/src/features/chat/MessageList.tsx` [修改]：`:53-60` 空态区�?`data-chat-welcome`
- tool call 行、`HtmlCard` 容器 [修改]：各�?`data-chat-*` 钩子（命名实施时定，遵循现有前缀惯例；首版范围：welcome + tool-call + HtmlCard——ApprovalCard/QuestionCard 已在 `data-chat-message` 内，按真实主题诉求再扩）
- `packages/presets/templates/agent-theme-template.css` [修改]：新钩子示例
- `packages/presets/skills/spherse-create-agent-chat-theme/SKILL.md` + `spherse-create-ui-theme/SKILL.md` [修改]：同步（R4.3 并入�?Task 验收�?- `docs/official/architecture/theming.md` [修改]：`:71-77` 契约清单同步

**测试**：新钩子 structure 测试（守卫清单：welcome/tool-call/html-card 至少 3 个）�?
**验证**：app 单测 + doc-sync 检查�?
---

## Task 13: R4.2 Agent config 新字�?[x]

**依赖**：T12（部分；可并行开工，验收合并）�?
**改动文件**�?- `packages/core/src/types.ts` [修改]：`AgentProfile :19-37` 加可选声明（最小集实施时定：qrList/开场白/placeholder/背景参数其一子集�?- `packages/contracts/src/` [修改]：对�?schema（跨层红线，contracts 先行�?- `packages/core/src/` agent markdown 序列�?[修改]：`agent-markdown.ts` 双向支持新字段（现有模板只保�?unknown frontmatter，不加则字段只读�?- `packages/app/src/features/agent-dialog/` [修改]：`AgentDialogForm` 加表单项（否则字段不可编辑）
- `packages/app/src/features/chat/index.tsx` [修改]：renderer 消费新字�?
**测试**：config 新字�?contracts 往返；markdown 双向序列化；表单渲染；端到端 agent 声明�?UI 生效�?
**验证**：core + contracts + app 相关测试�?
---

## Task 14: R7.1 世界书匹�?+ 注入 [x]

**依赖**：card capability 完善（本�?dev 已有）；�?T12/T13 可并行�?
**改动文件**�?- 范围口径�?*agent 级卡**——每�?agent �?`.spherse/agents/{slug}/` 下的卡（projector 视图已有 agentId，`SessionView` 不改）；异步预载为同步内存缓存（card 分支初始化时加载 + fs-watch 失效），projector 只读缓存（`ContextProjector` 为同步签名，不可异步读文件）
- `packages/core/src/capabilities/card/` [新增]：`matchWorldbook(recentText, entries)`（内�?`search.ts:13-33` 大小�?正则 fallback；selective/constant/position/insertion_order 在此实现，不�?`searchEntries`�?- `packages/core/src/capabilities/card/capability.ts` [修改]：实�?`contextProjectors`�?*�?`contextBlocks`**），`kind="worldbook"`，逐轮消费 fold �?messages �?keys 扫描；`constant` 恒注入；`enabled: false` 跳过；追加于 skill-catalog 之后
- `position` 在块拼接下的映射落定（ST before/after_char �?本仓块位置，二选一�?
- **实现注记（与上文偏离，以实现为准）**：缓存为 lazy 同步加载 + 逐轮指纹复核（目录 mtime + 各卡文件 mtime/size），未做分支初始化预载/fs-watch——`ContextProjector` 为同步签名，且 `CardStore.walkCardFiles` 跳过 `.spherse` 使其 `onChange` 对 agent 卡永不触发；`invalidateWorldbookCache` 仅作显式入口。`selective` 取 ST AND 语义（primary 与 secondary 必须同时命中；任一为空恒不触发）。上轮注入的 `<worldbook>` 块在扫描前剥离（自反馈阻断）。
**测试**�?- keys 命中（大小写不敏�?+ 正则）；constant 恒注入；disabled 跳过

**验证**：core 单测�?
---

## Task 15: R7.2 预算 + R7.3 顺序 [x]

**依赖**：T14�?
**改动文件**�?- `packages/core/src/capabilities/card/` [修改]：token/条目双上限（条目 �?、�?�?k tokens 起步可调）；超限�?order 优先级截�?- 调优记录：`docs/dev/investigation/worldbook-order-tuning.md` [新增]（判定标准：token 占比/指令遵循率）
- **实现注记**：`applyWorldbookBudget` 内部先按 `insertion_order` 排序再截断（调用方无需预排序；`parser` 将非有限值归一化为 0）；首个命中条目恒保留，单条超限时总量声明为例外（总量 ≤2k 在多条均摊场景成立）。

**测试**：预算截断单测（9 条→取前 8�?500 tokens→截�?�?k）；order 优先级排序单测�?
**验证**：core 单测 + prompt 实测一轮（记录落盘）�?
---

## Task 16: doc-sync + verify 全量 [x]

**依赖**：T1–T15 全部完成�?
**改动文件**：按 doc-sync skill 逐项检查（`docs/official/` 域文件、package README、backlog、i18n）�?
**验证**：`npm run verify`（lint �?build �?typecheck �?test）；E2E 按影响面选跑（chat/session/UI SDK 相关 spec）�?
---

## 非目标（Phase 3 / 另立项，不在本文�?
- R1.3 文档化（R1.1 已含版本语义）、R1.4 旁路声明
- R2.5b 回滚执行器（快照 vs undo 日志二选一，另立项�?- R6.1/R6.3 小项、R6.2 swipe（单独立项，�?backlog 会话分支项关系立项时定）
- E5 R5.1 `chat.html` 整窗替换（E1–E2 验证后评估；侧栏/顶部条等其余面板形式由其覆盖�?
