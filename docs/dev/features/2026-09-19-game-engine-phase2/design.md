# 游戏引擎二期设计（game-engine-phase2）

> 状态：**待评审立项**。一期 T1–T15 已合入（`58f8501`，R1.1/R1.2、R2.1–R2.4、R2.5a、R3.2、R4.1/R4.2、R7.1–R7.3）。
> 本期 = 一期 `design.md` §四 Phase 3 全集：R1.3/R1.4、R2.5b、R6.1/R6.3、R6.2（单独立项）、E5（R5.1，E1–E2 验证后评估）。
> 需求源：`docs/dev/investigation/2026-09-17-game-engine/requirements.md`（E1–E7，R1.1–R7.3）；一期设计：`docs/dev/features/2026-09-17-game-engine/design.md`。
> 许可红线沿用一期：ST/MVU 系 AGPL、JS-Slash-Runner Aladdin 许可——只学思路、不搬代码。

## 零、范围与非目标

- 本期范围：R1.3（version 语义文档化）、R1.4（旁路声明或告警）、R2.5b（回滚执行器）、R6.1（panic 锁定）、R6.3（删除回填）、R6.2（swipe，单独立项）、E5（`chat.html` 整窗替换，E1–E2 验证后评估）。
- 联动缺口（同域遗留，实施时一并定归属，不另开域）：backlog 技术债三条——同会话 trigger 订阅可用性（当前跳过+日志，`executor.ts`）、早失败 turn 的 `sp:turn-end` 配对、trigger 同 session 并发 restore 竞态。
- 非目标：不动一期已锁定语义（L1 嵌套上限、`set` 整替、三事件粒度、worldbook 队尾 user 块 + AND + 指纹缓存 + 双预算）；不往主 renderer 注 JS；不做 STscript 通用脚本语言；不引入 zod；不改 trigger `time`/`event` 现有语义与审批链；侧栏/顶部条等其余面板形式由 E5 覆盖，不再单独立项。

## 一、代码基线实证（行号为本地实测）

### R1.3/R1.4（`packages/core/src/capabilities/data/` + skill）

- 版本语义已实现、未文档化：`manifest.ts:52`（`MANIFEST_SUPPORTED_VERSION=2`）、`:54-56`（version:1 早于嵌套注释）、`:78-84`（version 越界整单 null + 诊断）、`:130-136`（version<2 遇嵌套跳过并注记 `require version:2`）、`hasNestedFieldRule :57-65`（只认 object/array）。
- 校验现状：`validate.ts:34`（`MAX_NESTED_LEVEL=1` 超限错）、`:152`（`fillDefaults = op!=="update"`）、`:94-100,210-216,242-254`（未知字段拒收；`match` 不得在 fields 重声明 `:205-207`）；`data-store.ts:267-289`（`set` 整替注释 `:281-283` 数组永不合并）；`outline.ts:106-135`（嵌套签名 + invalid/absent 文案）；`tools.ts:133-134`（`mutate_data` 描述无嵌套/version/L1 字样）。
- Skill 缺口：`spherse-build-data-app/SKILL.md:62`（`set` 写“合并”与整替矛盾）、`:187`（示例仍 `version:1`）、全文零命中 nested/object/array/properties/items/version:2/L1；可复用 `spherse-use-ui-sdk/SKILL.md:294,330-335` 的 key 级原子 + 集合走 mutate 约定。
- R1.4 三条旁路均未收敛：SDK `data.set/delete` 直写（`sdk/src/runtime/data.ts:11-12` → `server/src/routes/data.ts:96,113` `rawSet/rawDelete`，`data-store.ts:466-496` 仅 ForbiddenKey + resolve + 可选 ifVersion，无 manifest 校验）；`write_file` 直写（`tools/write-file.ts:24-30,43-69` 仅 resolve + JSON 合法性）；`edit_file` 直改（`tools/edit-file.ts:25-30,95-119` 同上；`tools.ts:17` 明示其为 fallback 演化路径）。ifVersion 透传已齐（`data-store.ts:178-180,396-400,475,491` + `types.ts:176,179-180`），但旁路 2/3 无 version 概念。

### R2.5b 回滚（归因已齐，回滚零代码）

- 归因覆盖（`tool-attribution.ts:56-124`）：`mutate_data→data`、 `edit_card→card`、`write_file/edit_file→write/edit`、`memory_save→memory`、`emit_trigger_event/manage_trigger→trigger`、`append_changelog/copy/move/generate_image→write`；否决条件 `:48-53`（error/denied/jsonError 不派生）+ `agent-runner.ts:550-556`。
- 接线：`agent-runner.ts:71-76`（beforeToolCall 建 `(sessionId,toolCallId)→turnSeq`）、`:519-525`（currentTurnSeq 取最后 turn/start）、`:538-562`（message_end drain 派生并 append `tool/result{sideEffects?}`）；查询面 `session-manager.ts:218-232`（`listSideEffectsByTurn` 已存在，按 turn/start 区间切分）；事件字段 `data/types.ts:3-11`（DataChangeEvent）、`card/types.ts:76-83`（CardChangeEvent）；`withdrawLastTurn :290-312` 仅追加 `turn/withdrawn` + `syncBufferFromLog`，零补偿；skill 已明示“撤回只截断不回滚”（`SKILL.md:160`）。
- 回滚缺口：全仓无 rollback/restoreSnapshot/undo 实现；SDK `data.set/delete`（origin:sdk）无 sessionId/turnSeq，`listSideEffectsByTurn` 查不到；`write/edit` ref 只有路径无 version/before 镜像；`memory_save` 无 delete API、`memory/trigger` ref 无 before 镜像；trigger firing 已产生新 turn。

### R6（`packages/app/src/features/chat/`）

- R6.1：`Composer.tsx:197-199` send 守卫 + `:369,411-419` disabled（仅 loading/attachBusy/streaming），无 panic；`useChatSession.ts:48-60` 直透无 panic 分支；`ErrorMessageSection.tsx:28,61-72` 行内 + retry；`ConnectionBanner.tsx:22-65` 三横幅无输入锁定；`panic` 全仓代码零命中。
- R6.3：`MessageList.tsx:64,81-84`（withdrawable 仅末条 user）、`reducer.ts:76-81`（turn_withdrawn 截断）、`streaming-store.ts:471-512`（withdraw + editAndResend 经 `composer-insert-store`/`draftKey` 回填）、`MessageItem.tsx:57,112-121,262-266`（编辑 + SendFailedBar，无删除入口）。
- R6.2：`swipe` 代码零命中；`websocket.ts:61-130/132-293`（replay 8 型 + server/client 事件，无分支语义）；`agent-event-parse.ts:15,98-186`（default→undefined）；`retry-plan.ts:8-40`（仅 retry-last/resend/none）。backlog 会话分支项（`backlog.md:58`，PR2 剩余：子 log 本地 seq 从 0 + fold 虚拟 seq 映射）关系待定，故 R6.2 必须单独立项。

### E5（对标 data/card 五层链路，chat.* 全缺）

- 样板：contracts（`data.ts:3-60`、`card.ts:65-172`）、server（`routes/data.ts:44-`、`routes/card.ts:49-` 10 方法）、app handler（`ui-sdk/handlers/data.ts`、`card.ts:19-201` 10 方法）、sdk（`runtime/data.ts:9-15`、`card.ts:5-15`）、配额（`ui-sdk/rate-limit.ts:1` 300/min，白名单含 data.get/keys/entries/mutate + chat.rect/chat.dock）。
- chat 现状：无 REST，仅 WS（`chat/ws-chat.ts:25-61`、`chat-channel.ts:21-42` restore/run 序列化/快照/重放/fanout）；app 侧仅 `chat-dock.ts:41,74,80`（dock/rect/undock）+ `send-message.ts:11` + `open-chat.ts:6-33`；sdk 无 chat 对象/`useSpherseChat`（`sdk/src/runtime/index.ts:41-56`、`dock.ts:95-135`）；壳结构锁死（`features/chat/index.tsx:35,131-173` Header + ConnectionBanner + MessageList + Composer）；降级零代码（HtmlCard 仅 fetch→src 降级 `:244-254` 可抄模式）。

## 二、核心决策（已锁定，含待评审项）

1. **R1.3 = 纯文档化**：实现已对（version:2 + 拒收 + 整替 + L1），本期只补 `spherse-build-data-app` skill（嵌套建模、`version:2` 升级规则、`set` 整替、未知字段拒收、`auto`/`match` 互斥）+ `mutate_data` 描述补嵌套/version/L1 字样；`SKILL.md:62`“合并”措辞必改。
2. **R1.4 = 声明优先**：三条旁路显式声明为“有意保留的演化通道”（`write_file`/`edit_file` 修 manifest、`data.set/delete` 键值直写），skill + 工具描述写明无校验；`write_file`/`edit_file` 写 `.data.json` 场景加提示文案（不拦截，实施时定文案）。补写时告警为备选，不默认做。
3. **R2.5b = undo 日志路线**：全文件快照在 20MB 上限（`data-store.ts:32,75`）下成本不可接受，选 before 镜像 undo。粒度为 turn 整轮逆、显式 `rollback` 指令（**withdraw 语义不变**：仍截断不回滚，见决策 6）。并发冲突（ifVersion/sha256）拒绝转人工，不强制覆盖。回滚本身走 `mutate` 幂等并产生新 `DataChangeEvent`（可再回滚）。
4. **R2.5b 可回滚边界**：首版仅 `data` + `card`；`write/edit` 文件型、`memory`（无 delete）、`trigger`（已产生新 turn）列为不可回滚类型，UX/skill 明确声明。前置条件（已部分落定，见实施注记）：SDK `data.set/delete` 补归因 plumbing（contracts 请求体 + routes 转发 + docked 卡片挂 sessionId，事件带 session）；但回滚发现面仍为 turn/tool-result（`listSideEffectsByTurn`），SDK 写无 session log 条目故首版不可回滚——合成 `tool/result` 会污染 fold/LLM 上下文，另建旁路日志则机制翻倍，均否决；plumbing 已就位供后续发现机制复用。
5. **R6.2 单独立项**：reducer 分支状态 + 持久化（append-only，分支带走 active 版）+ WS 事件 + swipe UI 三层联动，且与 backlog 会话分支项关系待定，本期只定接口方向（decision 8），实现另立项。
6. **withdraw 语义冻结**：withdraw = 截断不回滚（R2.5a 已文档化）；“撤回即回滚”不做，回滚只走显式指令。
7. **E5 方向锁定（实施最后）**：`chat.*` 只读+订阅族对标 data/card 五层（contracts → server → app handler → sdk → skill）；`useSpherseChat()` 封装；缺失/报错/超时降级回默认 `Chat`；仅项目本地文件可声明，作用域沿 project→agent 层叠；配额计入 300/min。E1–E2 验证（真机 prompt 实测 + 联动配额实测）完成前不开工。
8. **遗留三件套归属（已落定）**：① 同会话可用性 = busy-defer（executor 按 session 排队，busy 时存一次、 turn-end 到达重放一次，再忙则丢弃；`manage-trigger` event_name 描述已声明）；② 早失败配对 = synthetic `sp:turn-end{reason:error}`（`sendMessage`/`retryLastTurn` 在 prompt/afterTurn 抛错且无 `turn/end` 时补发，seq 取 turn/start，已有正常 turn-end 不双发）；③ 并发 restore = manager 级 per-session init memo（覆盖全部调用方，比 executor 内排队更彻底）。

## 三、分域方案

### R1.3 文档化（P2，小）

- 改动：`spherse-build-data-app/SKILL.md`（嵌套示例 + version:2 升级 + 整替 + 拒收规则）+ `tools.ts:133-134` 描述 + `outline` 行为已对无需改。
- 验收：skill 含「队伍→成员数组→hp/level」示例；`version:1` 含嵌套被拒文案可测；`set` 整替措辞与实现一致。

### R1.4 旁路声明（P2，小）

- 改动：skill + `mutate_data`/`write_file`/`edit_file` 工具描述声明三条旁路为演化通道；`write_file`/`edit_file` 写 `.data.json` 场景提示文案。
- 验收：文档检查（无行为变更单测，或提示文案单测）。

### R2.5b 回滚执行器（P2，中）

- 改动：`DataChangeEvent`/`CardChangeEvent` 加 before 镜像（字段名实施时定，contracts 同步）；store 落库时填 before；SDK `data.set/delete` 补归因透传；新增显式回滚指令（工具名与参数实施时定，推荐 `rollback_turn{sessionId,turnSeq}`）；`listSideEffectsByTurn` 复用为回滚源；不可回滚类型声明进 skill + 用户可见说明。
- 不碰：fold 废弃语义、withdraw 截断路径、retry 对称行为。
- 实施注记：`rollback_turn{turnSeq}`（host session 隐式、同会话限定；plan 曾推荐带 sessionId 参数，实施时简化）；store 层 `rollbackUndo` 自带版本守卫 + toolCallId 级幂等 + 双向 undo 记录（可再回滚）；`rollback` capability 经 `host.stores` 取 manager 自注册的 side-effect 源（`turnSideEffects` 键），无内核改动；`UndoRecord.path` 按 op 解释（data 为 mutation path/key，card 为 `entry:<id>`/`entries:<ids>`），`index` 保数组序；undo 信封只走进程内结果，不进 HTTP 响应 schema（wire 零变更）。
- 验收：某 turn 写入后显式回滚，data/card 恢复 before 值（单测 + 端到端）；SDK 直写纳入归因（单测）；ifVersion 冲突拒绝转人工（单测）；不可回滚类型声明检查。

### R6.1 panic 锁定（P2，小）

- 改动：`Composer.tsx:369,411-419` 加 `disabled + 原因` + i18n；不动 reducer/WS。锁定集合最小化为 `{reconnectFailed}`：唯一传输已死、需手动重连、发送必失的状态；historyError 传输存活且有独立重试不锁，`_withdrawError` 为行级已有展示不锁。附件按钮有意不锁：上传是本地动作，重连后可随草稿发出，不因锁定丢失已选文件。
- 验收：致命错误态输入区禁用 + 原因可见（组件测试）。

### R6.3 删除回填（P2，小）

- 改动：`MessageItem.tsx:264-287` 加删除入口 + streaming-store 旁新 `deleteAiTurn`（删 assistant + 上一条 user，回填经现有 draft 键），互斥说明：withdraw/edit/delete 同域——同守卫（非 streaming、无 pendingWithdraw/pendingEditResend、runtime 打开）、同范围（仅末轮，服务端只支持撤回末轮）、同通道（经 `runtime.withdraw()` + `turn/withdrawn` 截断）；delete 与 edit 互斥消费本轮，delete 用 `composer-insert-store` 回填用户原文、不重发，附件不跟随回填。失败语义：乐观回填——草稿在 withdraw 发出前即写入，服务端失败不回滚（与 edit 失败丢弃 intent 不对称，已用单测钉住）。withdraw 沿既有 fire-and-forget 范式（不检查 boolean 返回；isOpen 竞态悬挂 pendingWithdraw 为已知窄窗口，与 withdrawLastTurn/editAndResend 同例，另立项收敛）。
- 验收：删 AI 回复连带删上一条 user 并回填草稿（单测 + 组件测试）。

### R6.2 swipe（P2，单独立项）

- 本期只定：分支带走 active 版、切换记新事件（append-only 相容，一期决策沿用）；与 backlog 会话分支项关系在立项时定义。实现（reducer + 持久化 + WS + UI）不在本期。

### E5 R5.1 `chat.html` 整窗替换（P2，最后评估）

- 改动（对标五层）：contracts chat schema（`messages.list/subscribe/send/retry/withdraw` + runtime 上下文）→ server 路由/WS 扩展 → `handlers/chat.*.ts` → `sdk/chat.ts` + `useSpherseChat()` → skill 声明；配额计入 300/min（白名单与否立项定）；降级回默认 `Chat`（抄 `HtmlCard.tsx:244-254` 模式）。
- 验收（开工时定）：整窗替换端到端 + 降级三态（缺失/报错/超时）+ 配额说明。开工门槛：E1–E2 验证完成。
- 评估结论（2026-09-23，T9）：门槛未过，不开工。缺：① E1 真机 prompt 实测（`worldbook-order-tuning.md` 明确记录尚未执行）；② E2 联动配额实测。重估触发：两项验证结论落盘后。

## 四、实施顺序

1. **先行小项**：R1.3/R1.4（纯文档）+ R6.1/R6.3（Composer/MessageItem 局部，不碰协议）。
2. **中段**：R2.5b（含 SDK 归因前置 + 遗留三件套归属决策）。
3. **单独立项**：R6.2（待会话分支关系明确）。
4. **最后评估**：E5（E1–E2 验证完成后）。
5. 每域实施前补 `plan.md`（任务拆分落盘勾选，体例见 `2026-09-17-game-engine/plan.md`）；跨包 contract/schema 变更先行。
6. B1/B2/B3（附录 B）纳入同目录 `plan.md`，顺序 B2 → B3 → B1（bug 优先、由小到大），与 R1.3/R1.4/R6.1/R6.3 同批先行；B1 与 R6.3 同改 `MessageItem.tsx`，实施时相邻排期、以后合入者 rebase 为准。

## 五、验证清单

- R1.3/R1.4：skill 示例可跟做；version:1 含嵌套被拒回归；旁路声明文档检查。
- R2.5b：turn 级回滚单测 + 端到端（data/card 恢复 before）；SDK 直写归因单测；冲突拒绝单测；不可回滚声明检查；`listSideEffectsByTurn` 回归。
- R6.1：致命错误态禁用 + 原因组件测试 + i18n 检查。
- R6.3：删除连带 + 回填单测 + 与 withdraw/edit 互斥说明检查。
- R6.2：本期无实现验收，仅立项接口方向检查。
- E5：开工时定（整窗端到端 + 降级三态 + 配额）。
- 全域：`npm run verify`（lint → build → typecheck → test）；E2E 按影响面选跑（chat/session/UI SDK 相关 spec）。

## 附录 A：追加需求调研（2026-09-19，只记实证，不锁方案）

### A1. 聊天文本即渲染 HTML

- 现状：唯一渲染入口是 `render_card` 工具调用（`packages/app/src/features/chat/MessageItem.tsx:227-238`，`_card.type==="html"` 才挂 `HtmlCardRenderer`）；`message.content` 只走 `MarkdownContent`（`:204`），其 `rehypePlugins` 仅 `rehypeSlug`、无 `rehype-raw`（`markdown-content/MarkdownContent.tsx:186-193`），裸 HTML 转义、` ```html ` 走 `CodeBlock` 纯文本。
- 渲染与安全现状：`HtmlCard.tsx:198`（`sandbox="allow-scripts allow-same-origin"`）；file/inline 双分支（`:231-263` file_path 拉取 + fetch 失败降级直链 `:244-253`；`:265-276` inline content）；`onLoad :205` 经 `injectRuntime :77-96` 写 `__SPHERSE__` + postMessage；全文仅经 onUpdate 传输、不落库（`core/src/tools/render-card.ts:109-134`，`data-conventions.md:251`）；同 file 去重折叠（`model/html-card-dedup.ts:9-36`）。
- 缺口：`assistant` 文本出现 HTML 无任何 `content → _card` 合成路径；要免工具直渲需新增可信启发式（围栏/标记解析 + 合成只读卡），已超出“约定”范围。
- 推荐合成点（已锁定，见附录 B1）：渲染层 `MessageItem` 解析 assistant 文本围栏 → 合成只读 `HtmlCard{html}`（复用 `buildInlineSrcDoc` + 现有 sandbox + 不落库），不动 reducer 持久化（`chat-session-reducer.ts:180-199`）；仅 assistant 生效、`message_end` 后合成、多块并列 + 源码默认折叠。

### A2. Bug：无标签页项目没有首页

- 路由机制：`project/:projectId` 下 `index → WelcomePagePage`（`router.tsx:22-28`）；但 `ProjectScope.tsx:69-76` 在 tabs 模式（`feature-registry.ts:33` ALL_HOSTS 默认走 tabs）旁路 `Outlet`，首页实为 `TabPanel.tsx:141-153,162` 的 `HomeTabPanel`。
- 根因：初始空 tabs（新项目/无存储/`clearProject` 后 `byProject[pid]==undef`）或存储过滤出 `[]`（`loadFromStorage:76-78`）时，`TabContainer.tsx:81-82,109`（`tabs.length===0 && !split → return null`）无兜底，`Outlet`/Welcome 均不可达，即空 main；`closeTab :191-195` 有自愈而初始空无自愈。次要：`lastRoute` 无校验——`tab-route.ts:26-34` 返回 null 时 `use-tab-route-sync.ts:19-20` 不 openTab（`/content` 无 `?path`、`/browser` 非 loopback 场景）；tabs 下 `ContentBrowserPage.tsx:37-40` 的回退导航因 Outlet 不渲染而失效。
- 修复方向（已锁定，见附录 B2；下为调研时初判，store 播种取代 fallback 直渲）：`TabContainer` 空态播种 home（非 `:109` 直渲 fallback）+ `buildProjectRoute` 加 lastRoute 白名单校验（`/`、`chat/:id`、`content?path` 非空、browser loopback，非法回 `/`），附 tab-store/tab-route 单测。与浮窗域无关。

### A3. 聊天记录搜索（2026-09-19，只记实证）

- 结论：全链路零实现。renderer `features/chat` 内 `[Ss]earch` 唯一命中是 `useAgentTheme.ts:206` 的 URL hash 解析（`String.search`，无关）；会话列表域 `agent-session-list` 无 search/filter 输入；`showOpenFilePicker` 式全文检索无。
- 服务端只有分页、无关键词：`GET .../sessions/:id/messages` 仅 `limit/before` 游标（`server/src/routes/sessions.ts:80-103`，`limit` 上限 200），经 `project-manager.ts:173`（`getSessionHistory`）/`getRecentSessionHistory` 直读；会话列表同理只有 `limit/offset`（`:27-43`）。contracts 侧 `sessions.ts:60`（`SessionMessagesPageResponse` 信封）无 query/keyword 字段。
- 存储层可查但无索引：`events` 表为 `(session_id, seq)` 主键 + `data TEXT` 存 JSON（`core/src/store/session.ts:105-113`），`messages` legacy 表有 `content TEXT`（`:87-94`）；无 FTS 表、无 LIKE 查询、无触发器——关键词检索需新增查询路径（`events.data` LIKE 起步，或 FTS5 虚表二选一，待立项）。
- 前端历史链路：`streaming-store.ts:569-617`（loadMore/refreshHistory）+ WS `?since=` 游标重放（`ws-chat.ts:38-40`）+ `mergeHistoryMessages` 对账（`chat-session-runtime.ts:102-161`）——均为时间游标，无文本维度；搜索 UI（Composer/列表内查找框、跳位高亮）零代码。
- 范围提示：跨会话全局搜索 vs 本会话内查找是两个量级（后者可纯前端对已加载消息做；前者需 server contracts + 存储查询 + 列表 UI）。

#### A3.1 本会话内查找深挖（2026-09-19，只记实证）

- 数据源现成：`messages: ChatMessage[]` 已在内存（reducer state，`chat-session-reducer.ts:18`）；每条 `content: string`（user 纯文本 / assistant markdown）+ `_toolCalls`（`toolName/args/result`，`types.ts:58-66,98-117`）。可匹配面 = content + toolCalls 文本；排除项：折叠/superseded HtmlCard 的卡内 HTML（不在 content 文本内，`html-card-dedup.ts:9-36`）、streaming 未落定行（`_streaming`）、图片/附件二进制。
- 渲染可达：`MessageList.tsx:90-109` 非虚拟化 map 直渲（`flex-col-reverse` 容器 `data-chat-messages`，分组经 `groupTurns :45` 反序），每行 `MessageItem` 带 `data-chat-message` + `data-role`（`:147-148`）、气泡 `bubbleRef`（`:154-155`）；当前无 per-message id 属性（仅 React `key={_messageId ?? t-index}` `:72`）——跳位需新增 `data-message-id` 或 ref 表。
- 滚动可复用：`useChatScroll.ts:11-126` 持有 `containerRef` + `scrollToBottom` + column-reverse 锚定（loadMore 位置保持 `:121`）；查找跳转走 `scrollIntoView({block:"center"})` 即可，不与 streaming 自动跟随冲突（用户手势触发时才滚）。
- 高亮路线（已锁定，见附录 B3；下为调研时初判，自研 hook 方案作废，复用 `useContentFind` + `FindBar`）：CSS Custom Highlight API over 渲染后 DOM——不动 `MarkdownContent` remark 管线（动管线会打碎代码块，`MarkdownContent.tsx:186-193`）；Electron Chromium 可用，Web PWA Safari 待验证。备选：匹配前对 content 预分片（会污染 markdown 渲染，不推荐）。
- 边界记录：`hasMore` 为真时未加载历史不可搜（`MessageList.tsx:110-121` loadMore 之后才进内存）——查找范围声明为“已加载消息”，或提示先加载更多；大小写默认不敏感；折叠卡内文本不计入（与 A1 文本渲染合成互不干扰）。

## 附录 B：追加需求方案（2026-09-19，已拍板；行号为本地实测）

### B1. 文本即渲染 HTML（对应 A1）

- 架构：渲染层合成，零持久化。`MessageItem` 解析 assistant 文本围栏 → 合成临时 `HtmlCard{html}` → 复用 `HtmlCardRenderer`；`message.content` 原值不动（copy/TTS 不受影响）。
- 锁定决策：`allowInlineHtml` agent 开关（manifest 可选布尔，默认 false，未开启不触发）；`message_end` 后合成（`!_streaming`，streaming 中不合成）；多块全部并列渲染；**源码默认折叠**（`<details>` + 复用 `CodeBlock`，`components/markdown-content/CodeBlock.tsx`）；**合成卡只读、不注入 SDK**（`HtmlCard` 新增 `injectSdk?: boolean`，默认 true 保持现有行为，synthetic 传 false 跳过 `injectRuntime`：`HtmlCard.tsx:77-96` 的 `__SPHERSE__` + postMessage 整体跳过）。
- 通用性实证：唯一渲染入口仍是 `MessageItem.tsx:227-238`（`_card.type==="html"`）+ `:204` 的 `MarkdownContent`（无 `rehype-raw`，裸 HTML 转义，` ```html ` 走 `CodeBlock` 纯文本）；`HtmlCard.tsx:198` sandbox（`allow-scripts allow-same-origin`）与 `buildInlineSrcDoc` 由合成卡继承。
- 改动：`core/src/types.ts:34` 旁加 `allowInlineHtml?: boolean` + `store/agent-profile.ts:121` 旁 parse（`=== true || undefined` 范式，与 yolo 同例）；`contracts/src/agents.ts:29` 旁加可选字段（`agentSummary` 不动——Chat 经 `useAgentProfile`（`queries/project/agents.ts:27-38`）拿全量 profile，`profile?.allowInlineHtml` 直达）；`agent-markdown.ts`（`AgentFormData:20-31` + 白名单解构 `:58` + parse `:72` + build `:108-110`，raw frontmatter 手写本已生效、`extraFrontmatter` 往返不丢，表单是唯一缺口）；`AgentDialogForm.tsx` 加**无门控**开关（yolo 开关被 `hasAdvancedTool` 包裹 `:191-202`，本开关是渲染语义、不得复用该门控）+ 新 i18n 键 `agent-dialog.allowInlineHtmlLabel/Hint` ×3 locales。
- 合成渲染：新增 `features/chat/lib/html-fence-parser.ts`（提 ` ```html ` 块 + 位置 + 未闭合容错：`!_streaming` 下未闭合视为模型输出错误，EOF 视作闭合 + 剥离函数）；`MessageItem.tsx` 中 `role==="assistant" && !_streaming && allowInlineHtml` 时 `useMemo` 解析，每块渲染折叠源码 + `HtmlCardRenderer readonly`（key=`syn-html-${messageId ?? index}-${blockIndex}`，transient 行 `_messageId` 为空，兜底沿用 `MessageList.tsx:72` 的 `t-${index}` 惯例），传给 `MarkdownContent` 的 content 剥离围栏避免重复显示；合成卡不参与 `computeSupersededToolCallIds`、不落库。
- props 链：`index.tsx:70` 的 `profile` → `MessageList`（+`allowInlineHtml`）→ `MessageItem`；不动 summary 契约/列表路由。
- 边界：仅 ` ```html ` 围栏；user 消息与未开启 agent 不触发；执行面收敛靠 opt-in + 只读无 SDK + `!_streaming` 三重。“只读”仅指不注入 SDK：合成卡复用既有保存入口（`card.html` 非空即提供下载保存），用户可把 assistant 输出存进项目。

### B2. 无标签页首页修复（对应 A2，bug 优先）

- 根因：初始空 tabs（新项目/无存储/`clearProject` 后 `byProject[pid]==undef`、存储过滤出 `[]`）时 `TabContainer.tsx:109`（`tabs.length===0 && !split → return null`）无兜底，`Outlet`/Welcome 均不可达；`closeTab` 有自愈而初始空无自愈。次要：`lastRoute` 无校验（`buildProjectRoute` 仅 `startsWith("/")`，`use-project-actions.ts:8-11`）。
- 方案（store 播种，非直接渲染）：`TabContainer` 加 effect——`!split && tabs.length===0` 时 `openTab(projectId, { kind: "home", label: "" })`（`tab-store.ts:42-47` home identity 固定 `"home"`，去重安全；`:109` 的 `return null` 保留，首渲染仍空、次渲染见 home）。语义写明：`closeAll`/关末 tab 后自动回 home（此前为空白），TabStrip/路由/冷启动顺带修好。
- `lastRoute` 形状白名单：在 `tab-route.ts` 新增纯函数 `isValidLastRouteSuffix(suffix)`，内部用哑 projectId 复用 `routeToTabSpec:11-37` 判据（`/`、`/chat/<非空无斜杠>`、`/content?path=<非空>`、`/browser?url=<loopback>`，先拆 `?` 再判），`buildProjectRoute` 调用它、非法回 `/`。调用点共 4 处（`use-project-actions.ts` ×3 + `App.tsx:68` 冷启动恢复），修 helper 一次、四处继承。**不查 session 存在性**（`TabPanel.tsx:41-44` 已自愈）。
- 边界：仅修 tabs 模式；与浮窗域无关；新路由形状需同步维护白名单。
- 测试：`TabContainer.test.tsx`（空态播种 home；closeAll 后回 home）；`tab-route.test.ts`（`isValidLastRouteSuffix`：`?path=`/`?url=` 拆分、loopback 判定、非法→`/`）；`buildProjectRoute` 非法输入测试。

### B3. 本会话内查找（对应 A3/A3.1，DOM 渲染文本路线）

- 架构：纯前端，零 server 改动。**复用 `useContentFind` + `FindBar`**（ stateful DOM 检索路线；A3.1 的自研 `useChatSearch` + Highlight API 方案作废——引擎逻辑已有 `find-engine.test.ts`/`useContentFind.test.tsx` 覆盖，B3 只做搬移 + 接线）。
- 通用性实证（搬移唯一理由是分层）：`FindBar.tsx:8-12` 只吃 `containerRef/contentKey/onClose`，`useContentFind.ts:24-27` 只吃 `containerRef/contentKey`，`find-engine.ts` 零 import 纯 DOM；三件现居 `content-browser` 域，跨 feature import 违反分层。
- 搬移：`FindBar.tsx`、`hooks/useContentFind.ts`、`hooks/find-engine.ts` → `src/components/find-bar/`（`src/components/` 为可复用 UI 归属，`file-tree/`/`floating-frame/`/`markdown-content/` 为先例；`src/lib/` 只放纯函数，不放组件）；更新 `ContentView.tsx:12` 及两处测试 import；`data-content-findbar` 改名 `data-find-bar`（旧名泄漏原域，同步改 `FindBar.test.tsx` 查询）；`EditFindReplaceBar` 留守原域（绑定 editing textarea，属编辑域）。
- Chat 接线（`features/chat/index.tsx`）：`rootRef` + `findOpen` 状态；Ctrl/Cmd+F（**焦点域隔离**：仅当 `rootRef.current.contains(document.activeElement)` 时 `preventDefault + open`，照抄 `ContentView.tsx:143-153` 模式——`TabPanel` 全量 mount tab，仅 `display:none`，全局监听会抢后台 tab 的 Ctrl+F）；Esc 关闭（`FindBar.tsx:45-47` 已有 + `useContentFind.ts:86` 卸载清理）；在 `ConnectionBanner` 与 `MessageList` 之间渲染 `<FindBar containerRef={containerRef} contentKey={sessionId} onClose/>`（bar 在滚动容器外，`containerRef` 仍指向 `data-chat-messages` 内层 div，布局参考 `ContentView.tsx:221-229`；`contentKey=sessionId`，切会话自动重置 `:43-47`）。
- i18n：复用现有 `content-browser.find.*` 6 键，不新增（免 catalog churn；键名域名泄漏记 tech debt follow-up）。
- 已知行为（不动共享引擎，防回归 content-browser）：① `MessageList.tsx:91` 容器为 `flex-col-reverse` + groups 已反序，匹配按 DOM 序 = 视觉逆序，next/prev 方向可能反直觉；② `useContentFind.ts:49-66` 只在 `needle/contentKey` 变化时重算，流式中 DOM 变异下计数 stale（流式中查找为 best-effort）。两者均为手动验证项；若不可接受，后续给 hook 加 `order` 参数，另立项。
- 边界：搜渲染文本，会命中代码块/tool call 文本；`hasMore` 未加载历史不可搜（范围声明为“已加载消息”）；后续「多匹配高亮 + 跳过噪声区」升级动共享引擎时需回归 content-browser；空消息会话可打开空查找条（`data-chat-messages` 未挂载，无容器可搜，计数空白，不报错）。
- 测试：Chat 内 Ctrl+F 打开（焦点内/外两种）、计数、next/prev、Esc 关闭清高亮；content-browser 侧由既有 `ContentView.test.tsx:39-95` 回归。
