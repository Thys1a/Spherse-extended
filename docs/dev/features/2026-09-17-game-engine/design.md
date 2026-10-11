# 游戏引擎方向设计（game-engine）

> 状态：**design 评审已完成，评审意见已采纳并修复，待立项**。需求见 `docs/dev/investigation/2026-09-17-game-engine/requirements.md`（E1–E7，R1.1–R7.3）；5 个开放问题已于 2026-09-17 拍板（见该文档 §6）。
> 许可红线：SillyTavern / MVU 系 AGPL-3.0、JS-Slash-Runner Aladdin 许可——只学思路、不搬代码。
> 范围确定后本目录补 `plan.md`（任务拆分与落盘勾选），见同期 `2026-09-15-card-json-app-layer/plan.md` 体例。

## 零、范围与非目标

- 最小可用集（P0）：**R1.1（嵌套 schema）+ R2.1/R2.2（回合事件）**；可见性由现有 `floatContent` 承载（论证见 requirements §4）。
- 并行：E4（主题天花板 A 档）；第二批：E7（世界书自动注入，过渡期显式 `search_card`）、E5（`chat.html` 整窗替换，E1–E3 验证后再评估）；独立小项：E6（R6.1/R6.3，R6.2 改动面大单独立项）。
- 非目标（requirements §5）：不往主 renderer 注 JS；不做 STscript 式通用脚本语言；不引入 zod（沿 TypeBox/手写路线）；不改 trigger 现有 `time`/`event` 语义与审批链。
- 跨切面约束：新工具对存量 agent 不可见（模板只惠及新建，`2026-09-15-card-json-app-layer/design.md:283` 同例）；design 落地的新增工具/事件名需同步 `agent-template.md` + 迁移提示策略。

## 一、代码基线实证（行号为本地 dev 实测）

### E1 状态引擎（`packages/core/src/capabilities/data/`）

- 字段规则 TypeBox 定义：`manifest.ts:12-24`（5 种标量 + `values/required/default/desc`）；query 参数规则 `:5-10`；mutation 形状 `:34-41`；顶层 `dataManifestSchema :43-48`（**当前无运行时消费者**，实际解析走手写 `parseManifest :54-93`）。
- 接口类型：`types.ts:72-78`（`ManifestFieldRule`，无 object/array 成员——R1.1 需同步扩展）；`:153-157`（`read/mutate/rawSet/rawDelete`，后两者无 schema 校验——R1.4 标的）；`ManifestHealth :101-110`（R1.2 诊断附加位）。
- 手写校验：`validate.ts:27-91`（`validateMutationArgs`：required/default/类型/enum/auto 禁传/match 隐式必填/未知字段拒绝，失败抛 `DataValidationError`）；query 校验 `:98-162`。
- 执行：`data-store.ts:191` `applyMutation`（`:198` 调校验；`:242-261` `set` 为 `{...target, ...patch}` **浅合并**——嵌套 object 整叶替换，见决策 13）；`:270-302` `mutate`（幂等 key 锁外+锁内双查，LRU 1024 内存）；`:31` 20MB 上限；`:160-169` ifVersion 乐观锁；`:349-354` raw 路径 ifVersion。
- 工具：`tools.ts:88` `createQueryDataTool`、`:124` `createMutateDataTool`（描述 `:129` 明确“schema validation”；`:20-40` `errorText` 已透传 `DataValidationError.message`；`execute(_toolCallId, params, _signal)` 签名只有 toolCallId、无 turn/session 上下文——归因靠 `beforeToolCall` 映射，见决策 20）；query 执行 `query-engine.ts:60`（先 `validateQueryParams` 再 `getByDotPath`——query 侧为扁平过滤器，R1.1 不动）。
- 展示：`outline.ts:87-96` `formatEntrySignature`（仅顶层 required/optional，嵌套不可见——R1.1 需同步扩展，否则读侧看不见可写形状）。
- 健康度：`manifest.ts:101-123`（healthy/stale/absent/invalid）；非法条目 `parseManifest :63,76` 静默 `continue`（R1.2 标的）；版本硬编 1（`:52,57`，`version>1 return null`）。
- 路径：`dot-path.ts:38-47,59-67`（遇 Array 直接 missing，无数字索引分支——校验错误 key 的点分路径**不经过**此解析，见决策 12 备注）。

### E2 回合事件（`packages/core/src/trigger/` + chat 运行时）

- 执行：`executor.ts:50-56` `fire(entry, agentId, agentName, payload: string, eventName?)`（payload 为模板字符串——R2.4 深度计数需另加 opts，见决策 15）；`:42,57-58` `inProgress` 去重；`:74` 起始事件、`:145` 完成、`:159` 失败（`:165` finally 清理）；`:78-107` 三 session 模式；`:124` 经 `sendMessage(...,{source:"triggered"})` 等 `agent_end` 判 turnError。
- 调度：`scheduler.ts:35,45,52,61`（tick/到期/markFired/ensure）；`timer-service.ts:4` 10 分钟常量、`:15,21` 对齐与续约。
- 入口：`trigger-manager.ts:73-86` `onUserEvent`（`:74` 首行拒 `sp:`——R2.2 标的；`:80` 同 id 去重）；保留前缀 `validation.ts:3`（`RESERVED_EVENT_PREFIX="sp:"`）、`:14` 判定。
- 工具侧校验：`manage-trigger.ts:110,120-121`（`validateShape` 校验**订阅名** `event_name` 必填且禁 `sp:` 前缀——R2.3 需放行订阅侧）；emit 禁令在 `tools/emit-trigger-event.ts:40-50`（保留不动）。
- 类型：`core/src/types.ts:65` `eventName?`、`:80` 日志携带；`trigger-manager.ts:13` payload 字段。
- server：`server/src/bus/ws-bus.ts:94,100`（`emit-trigger-event` → `onUserEvent`，**无前缀检查**——R2.2 需同步加固，见决策 11）；`:11,14,110,119`（白名单/通道/订阅/下行）；contracts `bus.ts:123-129`（`emit-trigger-event` schema 仅 `minLength:1`）。
- 装配缺口（评审 C1）：`agent-runner.ts:40-48,58`（Runner 仅持 `RuntimeDeps + SessionControlBus`）、`session/runtime.ts:39-51`（`RuntimeDeps` 无 trigger 字段）、`factory.ts:110-129`（`SessionPort` 只进 capability.init）、`project-runtime.ts:44-52`（triggerManager 只暴露于 ProjectRuntime）——runner 直达 manager 无现成路径，见决策 10。另注意重入风险：`executor.ts:124-133` 经 `session.sendMessage` 回调 runner，同步回调用 manager 时 `existing_session` 指回同一 session 会撞 `agent-runner.ts:295-301` `ensureNotBusy`。
- 前端：`TriggerForm.tsx:82` 事件名输入（`:79-89` 容器；contracts `trigger.ts` 的 `eventName` schema 需同步放行 `sp:`）；`TriggerEventBridge.tsx:50,56`（订阅 + completed 通知/刷新）；`chat/tts/bridge.ts:7,12`（唯一回合 hook 注册/广播）；`streaming-store.ts:239,241`（`agent_end` 分发点）。
- 工具执行签名约束（R2.5a 前置）：`AgentTool.execute(toolCallId, params, signal?, onUpdate?)`（pi-agent-core `types.d.ts:349`）只有 toolCallId、无 turn/session 上下文；可用钩子为 `beforeToolCall` / `afterToolCall`（`types.d.ts:240,244`，`BeforeToolCallContext` 含 `toolCall + args + context`），AgentRunner 当前完全未用；`toolExecution` 默认 `"parallel"`（`types.d.ts:230`），归因映射须为 `Map<toolCallId, ctx>` 而非单槽。
- R2.1 埋点候选（`agent-runner.ts`）：`:175` turn 起点（`appendBatch([user/message,turn/start])`）、`:185` turn/start 标记、`:468-491` persistMiddleware（`:471` message_end、`:473` agent_end、`:479` turn/end 推导，`:493-500` 按 role 分流 assistant/toolResult）、`:242` retry 另一起点（**不 emit `sp:user-message`**，见决策 14）。

### E2 撤回链与副作用现状（新增 R2.5 实证）

- core：`agent-runner.ts:271-293` `withdrawLastTurn`（`:272` 只检查不置 `inFlight`；`:274-276` 逆序找最后 `user/message`；`:277-281` 已废弃拒绝；`:282-289` compaction 锚点拒绝；`:290` 追加 `turn/withdrawn{seq}`；`:291` `syncBufferFromLog` 重算；`:292` 返回锚点 seq）；`ensureNotBusy :295-301`；`session-manager.ts:96-100` 直透。
- fold：`fold.ts:101-111`（`turn/retried` 逐个 abandoned；`turn/withdrawn` 区间 `[userSeq, withdrawnSeq)` 全废弃）；`:41-65,29-39` 两处 derive 跳过废弃集；事件类型 `events.ts:44,60-64`（`turn/*` 非消息事件）。对比 retry：`agent-runner.ts:242-246`（标记 + 新 turn 并继续）vs withdraw（标记后结束，不开新 turn）。
- server：contracts `websocket.ts:264,201-203,110-114`；`chat-session-runtime.ts:340-344,258-260`（发送 + isOpen 守卫）；`ws-chat.ts:105-113`（catch 经 classify-run-error 回送 error）；`chat-channel.ts:115-122`（`:117-119` running 中 Conflict；`:120` 取锚点；`:121` 直接广播）；`chat-wire-projector.ts:64-66`（`turn/withdrawn` 不投影）。
- renderer：`streaming-store.ts:471-483`（streaming/不可撤回/未连接三重 no-op；`pendingWithdraw` + `runtime.withdraw()`）；`withdrawable.ts:3-9`；`reducer.ts:76-81`（首个 user 处 slice 截断）、`:67-73`（不改 streaming）；接线 `MessageList.tsx:63,81,83`、`index.tsx:154`、`useChatSession.ts:60`、`MessageItem.tsx:57,112-121,226`；失败 `_withdrawError :184-195`；草稿/scroll 均无 withdraw 分支。
- **副作用零回滚**：`capabilities` 内 withdraw/abandonedSeqs 零命中；`mutate_data`（`tools.ts:126-138` → `data-store.ts:266-413`）直接落库；`repairLog` 与 withdraw 无关。`DataChangeEvent`（`types.ts:1-8`）仅 `{file, version, origin, summary?}`（summary 仅 mutation 名），无 session/turn/toolCallId；`mutate` 无 ifVersion（`types.ts:155`）；card 四写无版本无旧值无事件（`types.ts:74-102`，`card-store.ts:262-342`）；`write_file/edit_file/memory/trigger` 均无撤销；`SessionEventLog` 三事件（`events.ts:25-45`）无 file/version 结构化字段，tool details 未持久化。

### E3 状态面板（常驻位复用现有机制；R3.1 已删除）

- 常驻位现成答案——浮窗承载任意文件：`ui-sdk/handlers/float-content.ts:5`（`floatContent`；同族 `float-session.ts:9`、`unfloat-content.ts:4`、`unfloat-session.ts:4`；web 壳降级跳转 `:9-12`）+ `features/floating-content-browser/store.ts`（`byProject` + localStorage 读写回 `:27-46`、`openFloat/closeFloat/setPosition/setSize/clearProject :55-128`）+ `FloatingContentBrowserManager.tsx`（按项目渲染）+ `FloatingContentBrowserContainer.tsx`（`FloatingFrame` + `ContentView` 预览含 HTML `:42-75`；自身文件变化刷新 `:29-31`；缺失自动关闭 `:33-37`）+ 文件面板一键浮窗切换（`user-file-panel/index.tsx:99-100`）；SDK 可调。结论：状态面板浮窗化无需新建 store，R3.1 删除；其余面板形式归 E5。
- 消息流卡片（R3.2 标的）：`features/chat/HtmlCard.tsx:24` 入口、`:193` 唯一 iframe 构建、`:234,244,267`（file/srcDoc 同源、fetch 失败降级直链、内联）、`:202` onLoad 统一 `injectRuntime`；srcDoc 流水线 `html-card-src.ts:44,58,39`；去重 `model/html-card-dedup.ts:9,10,26`（`MessageList.tsx:39` 计算，`MessageItem.tsx:233` 接线）。
- 刷新现状：`file:update` 唯一上游 `ui-sdk/event/use-event-bridge.ts:20,22,24`（fs-watch → 300ms 去抖 → 定向 postMessage）；`subscription-registry.ts:14,48`（仅该事件 + 精确路径）；卡片侧 `sdk/src/runtime/events.ts:75,106`。**`HtmlCard.tsx:46` 无 `file:update` 监听**（仅 props 变化一次性 fetch）；`data.mutate` 的 app 侧广播零消费者（`DataChangeEvent` 全仓 app 侧零命中）。

### E4 主题（现状 + 本轮 dev 增量）

- 钩子约 20 个 panel 级（`data-chat-*` 清单见 requirements 调研回报 §4，不复列）；无 welcome 位、无 tool call/卡片内部钩子（R4.1 标的）。
- 本轮增量：`useAgentTheme.ts` 新增 `prepareAgentThemeCss` / `rewriteThemeAssetUrls`（相对 `url()` 重写为 preview 绝对地址，跳过 `://`/`data:`/`blob:`/`/`/`#`），`features/chat/index.tsx:68-79` 接入——主题资源能力已增强，钩子本身未变。
- config 现状：`AgentProfile`（`core/src/types.ts:19-37`）无 qrList/开场白/placeholder/背景字段（R4.2 标的）；同步契约 `theming.md:71-77`（R4.3 标的）。

### E6（核查结论引用）

- 已有：Enter 发送 + 触屏区分（`Composer.tsx:43,357-367`）、三档增高 + 手动展开（`:25-29,91-112,378-388`）、streaming 停止键 + send 守卫（`:198,399-409`）、column-reverse + FAB（`MessageList.tsx:90,122-133`）。
- 缺：panic 锁定（R6.1；错误仅行内 + retry）、swipe（R6.2；全仓零命中）、删除回填（R6.3；仅 withdraw 截断 + editable）。

### E7 上下文注入（`packages/core/src/`）

- 接口：`kernel/capability.ts:32`（`contextBlocks?(view: SessionView)`）；`kernel/context-block.ts:1,6`（`{kind, render()}` + `\n\n` 拼接）；`capability.ts:24-26,34`（`contextProjectors`/`streamDecorators` 签名 `(view) => (messages) => messages`，消息以参数传入）；`ContextProjector` 为**同步**签名（`kernel/capability.ts:16-18`），在 `convertToLlm` 内同步调用（`agent-assembly.ts:247-255`），不可异步读文件；传入的 view（`agent-assembly.ts:230-235`）**无 sessionId**（`SessionView` 类型亦无），故作用域只能到 agent 级。
- 三实现：`memory/index.ts:39,42,48`（`kind="memory"`，空即 `[]`，末 20 条，`<memory>` 标签）；`time-perception/index.ts:22,24,27`（条件激活，无 XML 标签）；`skill/index.ts:18,30,36`（空即 `[]`，`<skill-catalog>` 全量目录，**无 keys 扫描**）。
- 消费：`agent-assembly.ts:189,192`（注册顺序即块顺序）、`:174`（固定前缀 → capability 块）、`:199` assemble；`:247-255` projector 逐轮应用 wire 路径；`agent-runner.ts:432` 仅重载时重调 build（含 blocks），`sendMessage:133-213` 主路径不重调 blocks。
- **关键约束（评审 C4）**：`contextBlocks` 是会话起点一次性快照，看不到每轮新消息；`kernel/ports.ts:68-73` 的 `SessionView` 无消息字段且无调用方会填充——R7.1 改走 **`contextProjectors`**（逐轮消费 `messages` 参数，收到的已是 `fold.ts:25` 折叠结果，`agent-runner.ts:502-506`），不扩展 `SessionView`，不直接读事件日志。

## 二、核心决策（已锁定，含评审修订）

1. **嵌套上限 L1**：object/array + 元素级 type/required/enum；跨字段引用、条件 required、完整 JSON Schema 子集不做。
2. **校验路线不变**：沿 `validate.ts` 手写 + `types.ts` 接口扩展；不引入 zod，不动 `manifestFieldRuleSchema` TypeBox 声明（无运行时消费者）。
3. **事件三嗓子**：仅 `sp:user-message` / `sp:assistant-message` / `sp:turn-end`；tool-call 级走 capability 中间件；流式事件禁止接入 trigger（fire 一次 = 一整轮 agent，重操作）。
4. **R2.2 = 新增 onInternalEvent + 放行订阅侧**：**保留** `trigger-manager.ts:74` 首行守卫（纵深防御）；新增 `onInternalEvent` 与 `onUserEvent` 共用私有匹配函数（抽取 `:77-85` 为 `fireMatching(eventName, payload)` 供两者调用）；`manage-trigger.ts:110-121` 的 `validateShape` 放行 `event_name: sp:*` 的**订阅**创建；`tools/emit-trigger-event.ts:40-50` 的 emit 侧禁令**保留**；`TriggerForm` 与 contracts `trigger.ts` 的 `eventName` 校验同步放行；放行订阅后确认 `isReservedEventName`（`validation.ts:14`）仅剩 emit 侧使用，无死代码。
5. **常驻位复用现有浮窗（R3.1 已删除）**：状态面板浮窗化 = `floatContent` 指定状态 HTML（`float-content.ts:5` + floating-content-browser 全套），不新建 store；侧栏/顶部条等其余面板形式不单做，归 E5（`chat.html` 整窗替换）覆盖。
6. **R3.2 走现成 `file:update`**：`.data.json` 变更本就经 fs-watch → 300ms 去抖 → 定向 postMessage；卡片侧订阅目标 data 路径 + 变更后重取即可，**不新增事件类型**（订阅路径须精确到目标文件，无通配；pinned 侧新增订阅 + 卸载清理，防 session 切换泄漏）。
7. **E7 改走 projectors（评审 C4 修订）**：原“`SessionView` 加 `recentMessages`”方案作废——`contextBlocks` 一次性快照看不到新消息，且 `ContextProjector` 为同步签名（`kernel/capability.ts:16-18`，`convertToLlm` 内同步调用 `agent-assembly.ts:247-255`），不可异步读文件。R7.1 改为 card capability 实现 `contextProjectors`：**agent 级卡**（`.spherse/agents/{slug}/` 下，projector 视图已有 agentId，`SessionView` 不改）+ 异步预载为同步内存缓存（初始化加载 + fs-watch 失效），逐轮消费 fold 后 messages 做 keys 扫描；不读事件日志。块顺序：新 `kind="worldbook"` 首版追加于 skill-catalog 之后，留一轮 prompt 实测调优（判定标准：token 占比/指令遵循率）。
8. **载体不混用**：游戏状态 → `data.json`；设定文本 → `card.json`。
9. **swipe 存 event log**：分支带走 active 版；切换记新事件（append-only 相容）。
10. **R2.1 装配路径（评审 C1）**：`RuntimeDeps` 加 `onTurnEvent?: (e) => void` 回调；late-binding 接线——`TriggerManager` 在 capability `init` 中惰性构造（`capabilities/trigger/index.ts:25-36`，getter 在 init 前抛错），`createRuntimeDeps`（`factory.ts:98-106`）早于 `init`（`:119-129`），故在 `capabilities` 数组（`:88-91` 已就绪）中按 `id === "trigger"` 取 capability，注入 lazy 闭包 `(e) => triggerCap.manager.onInternalEvent(e)`；回调只在 turn 期触发（init 之后），getter 不会提前抛错。备选 turnHooks。必须处理重入：`existing_session` 指回同一 session 时撞 `ensureNotBusy`（`agent-runner.ts:295-301`）——`sp:` 订阅触发同会话时跳过或排队，实施时定。
11. **WS 反伪造（评审 C2）**：`ws-bus.ts:94`（或 contracts parser）拒绝外部 `sp:` emit，只放行内部 `onInternalEvent`；验收加“WS 伪造 `sp:` 被拒”单测。
12. **版本与 R1.1 同发（评审 I2）**：`version: 2` 语义在 R1.1 实施时落定（推荐：`version: 1` 旧文件自动兼容，含 object/array 即要求 `version: 2`）；`parseManifest :57` 的拒收逻辑同步改，不留到 Phase 3。
13. **`set` 嵌套整替（评审 I3）**：`set` 对嵌套 object 整叶替换（与现有浅合并一致）；数组走 `append/update/remove`，`set` 不做元素级 patch；skill 与错误文本写明。
14. **emit 过滤（评审 I4/C5）**：`sp:assistant-message` 仅 `appendMessageEvent` 走 `assistant/message` 分支时 emit（toolResult 轮不 emit）；retry 路径不 emit `sp:user-message`，只 emit `sp:turn-end`；`sp:turn-end` payload 带 `reason`（completed/error/aborted），订阅方自保，防 error→trigger→error 链。
15. **深度计数（评审 I5）**：`fire` 加 `opts?: {depth, chainId}`（payload 仍为模板字符串，另传结构化 opts）；`SessionPort.sendMessage` meta 加透传字段；超限（如 5）记 trigger 日志并停；A→B→A 乒乓靠 chainId 识别。
16. **pinned 生命周期（评审 I6）**：内容外包 `ChatRuntimeProvider`（树外 runtime 为 null）；以稳定 `key={cardRef}` 隔离 + 缓存 srcDoc 字符串，不跟随 MessageList 重渲染（`DockedChatManager.tsx:52-54` 已实证 streaming 重渲染 remount iframe）；新 store key 推荐 `projectId → cardRef[]`（cardRef 含 sessionId+messageId+filePath），session 删除/切换/withdraw 时关闭或保留策略在实施时定义；不继承 floating-chat store“只写不读” bug；`FloatingFrame :56-57` 的 props-stale 用 `key` 或同步 effect 规避。
17. **worldbook 匹配器（评审 I7）**：新增 `matchWorldbook(recentText, entries)`（内复 `search.ts:13-33` 的大小写/正则 fallback，不复用整套 `searchEntries`——selective/constant/position/insertion_order 在其无语义）；`position` 在固定块拼接下的含义在实施时映射（ST 的 before/after_char 相对主提示词，本仓为块拼接）。
18. **诊断与展示（评审 M1/M3）**：`parseManifest` 保持签名，新增 `parseManifestWithDiagnostics` + `ManifestHealth` 加可选 `diagnostics`；`outline.ts:87-96` `formatEntrySignature` 扩展嵌套展示（如 `members[]: {hp!: integer}`），否则读侧不可见。
19. **验收可数化（评审 M5）**：E2 端到端 Phase 1 走直写 store 脚手架（`manage-trigger` 在 R2.3 前仍拒 `sp:`），抽测三 session 模式；E3 表述为“连续 10 次 mutate 只重渲染 ≤N 次且无报错”（N 实施时定）；E7 prompt 实测记录位置。
20. **归因传递机制（R2.5a）**：AgentRunner 用 `beforeToolCall` 建 `Map<toolCallId, {sessionId, turnSeq}>`（turnSeq 取 `turn/start` 的 seq；`afterToolCall` 清理条目）；工具把自身 toolCallId 透传进 store 写 opts（`mutate/rawSet/rawDelete`、card 四写均加可选归因字段）；store 查映射得 turnSeq 后填入事件。并行安全由 Map 的 toolCallId 键保证，不用 AsyncLocalStorage。
21. **R2.5a 不改工具签名**：`execute(toolCallId, params, signal?, onUpdate?)` 保持原样；归因走“钩子建映射 + opts 透传”两段式，store 本身不感知 turn。
22. **R7.1 作用域锁定 agent 级**：projector 拿不到 sessionId（实证见 §一-E7），故每个 agent 用 `.spherse/agents/{slug}/` 下的卡；异步预载为同步内存缓存（card 分支初始化加载 + fs-watch 失效），projector 只读缓存；`SessionView` 不改。

## 三、分域方案

### E1 R1.1（P0）：嵌套 fields

- 改动：`types.ts:72-78`（接口加 `type: "object" | "array"` + `properties` / `items` + 统一布尔 `required`）+ `validate.ts:6-21`（`checkValueType` 递归分支，错误路径点分拼接如 `party.members[0].hp`——**仅为校验明细 key，不经过 `dot-path` 解析**，`dot-path.ts:38-47` 无数字索引分支，数组索引查询另立项）+ `outline.ts:87-96` 嵌套展示。
- 版本同发（决策 12）：`version: 2` 语义同步落定。
- `set` 语义（决策 13）：嵌套 object 整替，数组走三件套。
- 不碰：`parseManifest` 宽容策略（R1.2 另处）、`applyMutation` 主流程（`data-store.ts:191-294`，校验后值直通）、query 侧（扁平过滤器，无嵌套需求）。
- 验收：requirements R1.1（队伍→成员→hp/level + 非法值 `DataValidationError` 附字段路径）+ 单元测试（嵌套合法/非法/数组缺必填/深路径错误）+ 旧文件 `version: 1` 回归。

### E1 R1.2（P1）：非法条目可诊断

- 改动：新增 `parseManifestWithDiagnostics`（收集 `{name, reason}`），`ManifestHealth` 加可选 `diagnostics`；`read_data` outline 与 `mutate_data` 错误文本附诊断（如 `mutations.hp_curve: op must be one of append/update/remove/set`）；存量 `parseManifest` 签名不动。
- 验收：requirements R1.2 + 单测（坏条目示例）。

### E1 R1.3/R1.4（P2）

- R1.3：已并入 R1.1（决策 12），本条只剩文档化。
- R1.4：文档 + `spherse-build-data-app` skill 显式声明三条旁路为“有意保留的演化通道”（推荐），或补写时告警；二选一，实施时定。

### E2 R2.1/R2.2（P0）：回合事件

- R2.1 埋点（`agent-runner.ts`，过滤见决策 14）：turn 起点 `:175` 后 emit `sp:user-message`；`appendMessageEvent` 走 `assistant/message` 分支时 emit `sp:assistant-message`；`:479` turn/end 后 emit `sp:turn-end`（带 reason）。payload 统一 `{sessionId, agentId, seq?}`；`:242` retry 只 emit `sp:turn-end`。
- 装配（决策 10）：`RuntimeDeps` 加 `onTurnEvent` 回调，factory 接 `TriggerManager.onInternalEvent`（新方法）；重入策略实施时定。
- R2.2 放行：删除 `trigger-manager.ts:74` 首行守卫 + `ws-bus.ts:94` 拒绝外部 `sp:`（决策 4/11）；其余匹配逻辑（`:77-85`）不动。
- 验收：requirements R2.1/R2.2（trigger 日志可观察 + 「收到 AI 消息后触发」实际 fire + 三 session 模式与审批语义沿用）+ 单测（emit 次数/去重/白名单 + **WS 伪造 `sp:` 被拒**）。

### E2 R2.3/R2.4（P1）

- R2.3：`TriggerForm.tsx:79-89` 事件名输入改为下拉（含 `sp:*` 三项 + 说明）；`manage-trigger.ts:110-121` + contracts `trigger.ts` + 表单校验同步放行 `sp:` **订阅**（emit 侧禁令保留）。
- R2.4：executor 链深度计数（决策 15：`fire` opts `{depth, chainId}` + meta 透传 + 超限记日志停）；与 `isRunning` 同 id 去重正交。

### E2 R2.5（P1 归因，P2 回滚另立项）：撤回语义与副作用

- 现状结论：withdraw 全链（core 标记 → fold 废弃 → server 广播 → renderer 截断）只处理消息投影；`data.mutate`/`card` 写/`write_file`/`memory`/`trigger` 副作用全部保留，无任何回滚代码（实证见 §一-E2 新增节）。
- R2.5a 归因补齐（P1）：`DataChangeEvent` 加 `sessionId/turnSeq/toolCallId`（决策 20 机制：`beforeToolCall` 建映射 + store opts 透传 + `afterToolCall` 清理，并行安全）；card 加同构 change event；tool result 的 `details.{path,version}` 持久化关联。验收：某 turn 内所有写入可按 turn 列出（单测 + 日志可观察）。
- R2.5b 回滚执行器（P2，另立项）：快照 vs undo 日志二选一；验收在立项时定。本 design 不展开。
- 语义文档化：withdraw = 截断不回滚，写入 skill 与用户可见说明（与 R2.5a 同批或先行）。
- 不碰：fold 废弃语义、截断路径、retry 对称行为。

### E3 R3.2（P1）：data 联动重渲染（R3.1 已删除）

- 删除理由：`floatContent` 浮窗已有同等常驻能力（§一-E3），状态 HTML 浮窗化后滚动仍可见，不新建 store；其余面板形式归 E5。
- 卡片侧订阅目标 `.data.json` 的 `file:update`（`sdk/src/runtime/events.ts:75` 已有 API；路径须精确，无通配），变更后重取关联 query 并重渲染；消息流卡片（`HtmlCard.tsx:46` 现无监听，需新增）与浮窗 `ContentView`（现仅自身文件变化刷新）均覆盖；加卸载清理（防 session 切换泄漏）；host 侧零新增（`use-event-bridge.ts:20-24` 已覆盖 data 文件）。
- 验收：requirements R3.2（`data.mutate` 后关联卡片即时刷新）+ 可数行为（连续 10 次 mutate 重渲染 ≤N 次且无报错，N 实施时定）+ 300/min 配额说明。

### E4 R4.1/R4.2（P1，可并行）

- R4.1：新增钩子候选——welcome 位（`MessageList.tsx:53-60` 空态区）、tool call 行、各类卡片容器（ApprovalCard/QuestionCard/HtmlCard/ToolCallSection）；同步 `agent-theme-template.css` + 双 skill（`theming.md:71-77` 契约）。
- R4.2：`AgentProfile`（`core/src/types.ts:19-37`）加可选声明（qrList/开场白/placeholder/背景参数其一子集，实施时定最小集）；renderer 在 `features/chat/index.tsx` 消费；contracts 加对应 schema（跨层红线）。
- R4.3：随前两者同步 skill（非独立任务，并入验收）。

### E5 R5.1（P2，方向锁定，E1–E3 验证后再评估）

- `chat.*` 只读+订阅族设计对标 `data.*`/`card.*` 五层链路（contracts → server → app handler → sdk → skill）；SDK 封装 `useSpherseChat()`；降级策略（缺失/报错/超时回默认 `Chat`）；仅项目本地文件可声明；配额计入 300/min 预算；侧栏/顶部条等其余面板形式需求由本节覆盖（不再单独立项）。

### E6 R6.1/R6.3（P2，小项）；R6.2（P2，单独立项）

- R6.1：错误态（持久化失败/致命错误）禁用输入区 + 原因提示；不改变行内错误 + retry 现状。
- R6.3：删 AI 回复连带删上一条 user 并回填草稿；与 withdraw/edit 语义的互斥说明。
- R6.2：swipe 存 event log（决策 9），分支带 active 版；改动面 reducer + 持久化 + UI，单独立项（与 backlog 会话分支项的关系立项时定）。

### E7 R7.1–R7.3（P1，第二批）

- R7.1：card capability 实现 `contextProjectors`（**非 `contextBlocks`**，决策 7 修订）`kind="worldbook"`：**agent 级卡**（决策 22：`.spherse/agents/{slug}/` 下，异步预载为同步内存缓存，projector 只读缓存）→ 逐轮消费 fold 后 messages → 新增 `matchWorldbook(recentText, entries)`（内复 `search.ts:13-33` 大小写/正则 fallback；selective/constant/position/insertion_order 在此新函数实现，不在 `searchEntries`）→ 命中排序注入；`constant` 恒注入；`enabled: false` 跳过。`position` 在块拼接下的映射实施时定义。
- R7.2：token/条目双上限（数值实施时定，建议条目 ≤8、总 ≤2k tokens 起步可调）；超限按 order 优先级截断。
- R7.3：块追加于 skill-catalog 之后；与 `<memory>`/`<time>` 的相对顺序留一轮 prompt 实测调优（判定标准：token 占比/指令遵循率，调优记录落盘）。

## 四、实施顺序

1. **Phase 1（最小可用）**：R1.1（含版本语义 + outline + `types.ts`）→ R2.1/R2.2（含装配路径 + WS 反伪造）。可见性由现有 `floatContent` 承载，无需新建；E1/E2 双线并行。
2. **Phase 2**：R1.2、R2.3/R2.4、R2.5a、R3.2、R4.1/R4.2（+R4.3 并入验收）、E7（R7.1–R7.3）。
3. **Phase 3**：R1.3 文档化、R1.4、R2.5b（另立项）、R6.1/R6.3、R6.2（单独立项）、E5（R5.1，E1–E2 验证后评估）。
4. 每域实施前补 `plan.md`（任务拆分落盘勾选，体例见 `2026-09-15-card-json-app-layer/plan.md`）；跨包 contract/schema 变更先行。

## 五、验证清单

- E1：嵌套合法/非法/数组缺必填/深路径错误单测；`mutate_data` 端到端（队伍→成员→hp）；R1.2 坏条目诊断单测；旧文件 `version: 1` 回归；outline 嵌套展示单测。
- E2：三事件 emit 次数单测（含 retry/toolResult 过滤）；`sp:` 订阅 fire 端到端（Phase 1 走直写 store 脚手架，抽测三 session 模式）；`manage-trigger` 仍拒绝 `sp:` emit + **WS 伪造 `sp:` 被拒**；链深度超限截断单测；10 分钟 cron 回归；R2.5a 归因字段单测 + turn 写入可列；withdraw 语义文档化检查。
- E3：`file:update` 联动刷新可数断言（连续 10 次 mutate 重渲染 ≤N 次且无报错）+ 卸载清理单测；配额 300/min 下行为。（滚动可见由现有浮窗机制覆盖，无需验证。）
- E4：新钩子 structure 测试（守卫清单见 plan）；skill 同步检查（doc-sync）；config 新字段 contracts 往返。
- E7：keys 命中/constant/禁用单测；预算截断单测；prompt 实测一轮（记录落盘）。
- 全域：`npm run verify`（lint → build → typecheck → test）；E2E 按影响面选跑（chat/session/UI SDK 相关 spec）。
