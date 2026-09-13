# 聊天新功能群方案设计

时间：2026-09-11。方案已定稿，未实现。

## 0. 总览与顺序（审查修订版）

| 批次 | 功能 | 体量 | 备注 |
|---|---|---|---|
| A | 5 选择后右键菜单 | 小 | 纯 renderer；需 Composer 受控插入接口 |
| B | 3 会话内快捷切换模型 | 小中 | `sessions.model` 列持久化；拆持久覆盖与单次 override |
| C | 8 系统通知（审批 + trigger） | 中 | 不立插件层；手动提醒延 v2 |
| D | 1 会话附加文件 | 中 | 先做多附件重构；首版纯文本类；PDF 拒绝 |
| E | 6 消息编辑后重新发送 | 小 | 依赖 D；新增 `pendingEditResend` 等待态 |
| F | `user/message` meta 扩展 + 2 斜杠命令 | 中大 | slashMeta/summon 共用一次事件扩展；项目级命令；textarea 编辑器 |
| G | 4 召唤另一个 agent | 中 | 拦截在 run 启动前；持久化召唤卡片 |
| H | 7 桌宠步骤 1（外观态） | 小 | 纯 renderer；OS 窗口 + 形象上传延 v2 |

批次 A/B/C/D 相互独立可并行；E 紧跟 D；F 的 meta 扩展是 G 的前置；H 可随时并行。

横切约束：contracts 先行、i18n 以 zh-CN 为基准、双壳降级矩阵、`closeProjectCascade` 清理新增 per-project 状态。

## 6. 消息编辑后重新发送（批次 E，依赖 D）

- user 气泡 hover 显示编辑图标（与 withdrawable 同条件：倒数第一个 user、非 streaming、非 `_sendFailed`、未被 compaction 覆盖）。
- 点击 → 原地变 textarea（预填原文）+ 确认/取消 → 确认后 `withdraw()` → 新增 per-session `pendingEditResend: {content, attachments} | null`，收到 `turn_withdrawn` 后 `sendMessage(edited, 原附件)`，复用 resend 分支形态；withdraw 失败（error/`_withdrawError`）时丢弃 intent。
- 附件携带依赖批次 D 的多附件数组（`sendMessage(sessionId, text, attachments[])`）；D 未落地前不单独做单图兼容。
- 失败回退走现有 `_sendFailed` 条；streaming 中、非最后一个 user 禁用。已压缩 turn 的入口过滤需 anchorSeq 透传，暂缓（当前可点，withdraw 走失败分支丢弃 intent 并标 `_withdrawError`）。`editAndResend` 返回 boolean，失败时编辑器保持打开可复制草稿。无 contracts/server/core 改动（除复用 D 的附件数组）。

## 5. 选择后右键菜单：复制/引用（批次 A）

- bubble 容器 `onContextMenu`：`preventDefault`，选区非空且双端（anchor+focus）落在当前 bubble → 轻量自绘 `SelectionMenu`（fixed div + portal body + `useDismissable` + 滚动关闭；未用 `components/ui/context-menu`，因 base-ui Trigger 需包裹每个 bubble 且 anchor 定位复杂，回迁条件为需要箭头键导航/焦点管理时）：复制 / 引用到当前会话。
- 复制：`navigator.clipboard.writeText(selectedText)`，不可用/拒绝弹 toast（`chat.selectionMenu.copyFailed`）。
- 引用：经 `composer-insert-store`（sessionId+text+nonce，消费确认防重放/双挂载复插）在 Composer 光标处插入 `` ```quoted `` md 代码块（用户可随意修改，围栏按内容自动加长），聚焦 Composer；无 sessionId 时隐藏引用项。首版不做可取消引用块 UI。
- HtmlCard iframe 内选区取不到父页面，作为已知 non-goal。
- desktop `setupContextMenu` 不动（bubble 区本就 early-return）。

## 3. 会话内快捷切换模型（批次 B）

持久覆盖与单次 override 是两套机制，分开实现：

- 会话模型（持久）：core `sessions` 表新增 `model` 列（沿 `store/session.ts:133` 的 ALTER TABLE 迁移先例）；`SessionManager.setSessionModel` 经 `ModelCatalog` 校验后落库（未知模型抛 `ValidationError`→HTTP 400，空串清除），活会话经 `applySessionModel` 即时生效；解析统一 `session > profile.model > global`（`status`/`model-resolver`/`agent-assembly`/`ensureModel`/`applyDefaultModel`/`getSessionStatus`）。读取为 DB 直读（落库即真相，无内存 map）。已知残留：pi `AgentState.model` 类型非空，清除到“无处可回退”时活 runner 内存模型无法置空（保留旧值），但下一次发送必经 `ensureModel` fail-closed，且 `getStatus` 本就按“读内存活模型”语义（有测试钉住），不改。
- 单次 override（供 §2 命令 `model` 字段）：`ensureModel`/`sendMessage` 新增可选 `modelOverride` 入参，仅本 turn 生效，不入库；无效值抛 `ValidationError`（与持久路径同语义），抛错点在事件落盘前。`retryLastTurn` 暂不加参（等批次 F 真需要时再加）。
- contracts：`PATCH /projects/:pid/sessions/:sid/model`，body `{modelId}`（空串表示清除；Fastify 会把数字 coerce 成字符串，接受该行为，无效 id 由 catalog 校验以 400 拦下），经 `ModelCatalog.resolveModelById` 校验；`SessionInfo`/`agentSummary` 加可选 `model`。
- server：`routes/sessions.ts` 加路由，通知 `SessionManager.setSessionModel()`。
- app：Composer 顶栏当前模型 pill 标记（显示 model 名/简写，点击展开下拉切换）；数据源 provider catalog，初值 `session.model || agent.model || global`；切换即调 API。历史中不追加系统消息。
- vision 模型：保持独立管理，不联动（用户在 Settings 单独切换）。

## 8. 系统通知（批次 C；手动提醒延 v2）

触发点：

1. 审批时：`ApprovalNoticeBridge` 的 toast 保持同会话抑制（正在看该会话只看卡片），OS 通知走窗口失焦门（切走应用也通知）。
2. AI 提醒：`TriggerEventBridge` 的 `trigger_completed` 分支（已有 `notify` 判定，命名复用 trigger action 的 `notify`/`notificationMessage`）；`trigger_failed` 不通知。

实现：host-bridge 加 `notify(title, body, opts?: {route})` + `onNotificationClicked` + `HostCapabilities.notification` 能力位 + `system-notification` 特性门（ALL_HOSTS）；失焦时 toast 与 OS 并存是刻意为之。desktop 主进程 `new Notification().show()`（输入归一化 + 长度帽 + try-catch），点击聚焦主窗（最小化先还原）并经 `notification-clicked` 事件回 renderer 跳转会话（Windows `setAppUserModelId` 放模块顶层）；web 用 `Notification.requestPermission()`（拒绝则跳过并 debug），点击仅聚焦；electron-store 全量字段透传 `notifications`（`getMaskedSettings`/`saveSettings` 缺一即假持久）。`HostSettings.notifications: {approval, trigger}` + Settings 两个开关（按 capability 禁用）。不立独立插件层。

## 1. 会话附加文件（批次 D；§6 的前置）

首版范围：文本类（`text/plain`、`text/markdown`、`application/json`）；PDF 纯拒绝（toast 见 §9）。

- core：新增 `TextAttachmentProcessor`（读→大小检查→截断→ `{type:'text', content, truncated, originalSize}`），注册到 `attachmentCapability`（`PreparedContentBlock` 已有 `text` 分支，projector 透传）。截断预算与折叠策略见 §9。
- server：`routes/attachments.ts` 白名单扩到文本三类；分级上限（图片 5MB，文本 2MB）；PDF 上传 400；`preview.ts` 按扩展名放行文本类（`text/plain; charset=utf-8`）；新增 `/attachments/:id/download`。
- app（多附件重构，§6 依赖本节）：`types.ts` 放开 `type: string`；`sendMessage` 全链改 `attachments[]`（types、`api.uploadAttachment`、`chat-session-runtime`、`streaming-store` 乐观 `_attachments`）；Composer `multiple` + accept 白名单（`image/*,.txt,.md,.markdown,.json` + 对应 MIME，与 server 白名单对齐）+ `AttachedFile[]`（图片走 `compressImage`，其他直传；`Promise.allSettled` 部分成功保留、失败列名 toast）；AttachmentBar 加文件行（图标+名+大小+删除）；MessageAttachments 非图片渲染下载链接（`?token=` 鉴权）+ 截断提示；wire `type` 全链统一 image/text（`toWireAttachmentType`）。
- 接受行为：附件正文与图片同生命周期——会话内存中有效，`stripUserAttachments` 剥离持久化，重启/restore 后上下文不再含附件正文；截断预算按 UTF-8 bytes（16KB 默认），BOM 自动解码（UTF-8/16LE/16BE），单轮总额帽暂缓（后续见下）。

## 2. 斜杠命令（批次 F，与 summon 共用 meta 扩展）

范围裁剪：**完全不做 `!cmd`**；`/command:` **不做 agent/subtask 字段**（不与功能 4 联动）；**管理 UI 要做**；命令只做项目级 `.spherse/commands/`（`SkillStore` 无全局层先例，全局目录不做）。

- core：新建 `CommandStore`（镜像 `SkillStore` list/get；并发写以文件路径为粒度互斥，无跨文件事务，属 last-write-wins）；frontmatter 仅 `{description?, model?}`；纯函数 `SlashResolver` 解析 `^/(skill|command):(\S+)(?:\s+(.*))?$`；展开器：`/skill:` 复用 `SkillStore.get` + `load-skill` 拼装格式（`@` 不展开，沿 skill 文件列表 + read_file 机制），`/command:` 展开 `$ARGUMENTS`/`$1..`/`@path`（`@` 要求行首/空白/左括号边界、剥尾随标点、跳过邮箱形、policy 拒绝抛 `AccessDeniedError` 与缺失区分、按 index 重建防污染；`@` 走 read + access policy + §9 截断预算），缺参数抛 ValidationError；展开点为 `AgentRunner.sendMessage` 前（`deps.projectStore` 可达 agentStore，不破坏 capability 分层）；`model` 字段走 §3 的单次 override（CRUD 路由建/改时经 catalog 预校验）。
- 事件扩展（与 §4 summon 共用一次改动）：`user/message` data 加 `slashMeta?: {type, name, rawArgs}`，同步 `fold.ts`、contracts、`chat-wire-projector`、reducer pill 渲染；仅加可选字段，`EVENT_SCHEMA_VERSION` 不升级（沿 triggerName 先例）。
- contracts：`CommandDefinition` schema + list/get API；server：CRUD 路由（resolve 路由暂缓：展开收敛在 `AgentRunner.sendMessage`，暂无第二消费方）。
- app：Composer 输入 `/` 弹出补全（skill + command 列表，显示 description 与 model 徽标）；未知名称 toast 不发送（列表未加载时放行，靠服务端 ValidationError）；历史与当轮凭 `slashMeta` 显示原始 `/skill:x` pill（renderer 消费 `user_message` 回执：有未结算乐观消息则注记 `_messageId` + meta，否则追加持久行）。
- 管理 UI：左侧栏 Commands 面板（与 Skills 同级）：列表（名+description）+ 新建/编辑（textarea，与现有内容编辑一致，不引入 monaco 依赖）/删除，复用 skill-panel 结构。
- 安全：命令文件视为不可信输入；每次使用重读；路径走 `resolveProjectPath`/`assertInsideProject`。

## 4. 召唤另一个 agent（批次 G，依赖 F）

新语法（fire-and-forget，当前会话不等待、不回注）：`>> <agent-slug> <message>`。

- 拦截层（审查修正）：**不经过 `AgentRunner.sendMessage`**（否则当前 agent 会对字面 `>>` 文本跑 turn）。落点为新增 HTTP 端点 `POST .../sessions/:id/summon`（而非 ws-chat message 分支）：WS 无回执，app 无法确定落库时序做 refresh；HTTP 200 即代表 note 已持久化，app 随后 `refreshHistory` 必能看到卡片，且路由测试可覆盖全链路（与 `POST .../messages` 的 detached 模式同构）。
- 服务端：按 slug 查 agent（未知→404）→ 建目标会话 → 当前会话落 `user/message`（content 为原文，`source: "summon"` + `summon: {agentId, sessionId, agentName}`，经新增 `SessionManager.appendUserMessage`，per-session promise 链防 seq 竞态，不启动当前 run）→ `hub.startDetachedRun` 目标会话；注记/启动任一失败则归档刚建的目标会话后抛错（目标 run 内的异步失败沿 detached 既有语义，不可见）。
- 目标会话收到的 message 原样再过一次 slash 展开（与 trigger/普通发送一致）。
- app：Composer 输入 `>>` 显示 agent 补全下拉；发送时 `>>` 走 `summonToAgent` + `refreshHistory`（未知 slug 由服务端 404 → toast；格式不全 toast 用法；带附件拦截）；`MessageItem` 渲染可点击跳转的召唤卡片（`onOpenSession`，ChatPage/浮窗接路由；字段缺失降级）。
- 目标会话：`sessionRuntime.createSession` 建新会话 + `hub.startDetachedRun` 跑消息后立即返回（文本-only；`SessionPort` 仅 Hub 内部使用）。
- contracts：`summonRequest{targetSlug, message}` + `summonResponse{ok, targetSessionId}`。
- 与 trigger 的区别：trigger 是事件驱动自动化，`>>` 是用户主动即时召唤。

## 7. 桌宠模式（批次 H，仅步骤 1；OS 窗口 + 形象上传延 v2）

步骤 1（纯 renderer 外观态）：`floating-chat/store.ts` 加 `mode: 'full'|'pet'`（随现有 localStorage 写路径持久化，无读恢复路径）；`FloatingFrame` 加 `variant` + `onTogglePet`（pet 无标题栏/resize，整框拖拽，交互元素免拖）；桌宠分支为形象圆按钮（agent 首字大写，点击返回完整模式，键盘/触屏可达）+ 迷你单行 Composer（经 `useChatSession` 独立挂载，与 Chat 共享 store，streaming/loading 对齐禁用，`>>` 走同一召唤入口）+ hover/focus 悬浮条（仅关闭）；进入 pet 停止 TTS；主题链不变；未上传形象用 agent 头像。

v2（本次不做）：OS 级第二窗口（独立 JS context 会产生第二份 store/WS 状态，需专项设计）+ agent 右键"上传形象"（需 `AgentProfile.avatarPath` 字段，动 profile frontmatter 解析/emit + contracts + preview 放行；超出固定范围等比缩小存 `.spherse/agents/<slug>/avatar.png`）。

## 9. 保留问题调研结论

### 9.1 文本截断预算（对标 harness）

| harness | 上限 | 超限行为 |
|---|---|---|
| opencode | `read` 工具 2000 行 / 50KB，超长行 2000 字符截行；tool 输出同帽 | 字节/行数双帽提示（`Output capped at 50KB…Use offset=N`），全文落盘保留 7 天，返回 head/tail 预览 |
| Claude Code | Read 默认 2000 行；tool 输出约 30KB 截断（落盘+约 2KB 预览）；v2.1.51+ 50K 字符 tier 降级 | 全量 inline 或落盘二选一；大 `@` 文件靠规则/hook 降级为路径引用 |
| Cursor | 未公开单文件上限 | 无 per-file 硬截断，靠语义检索+自动压缩旧轮 |
| Cline/Roo | 未公开行数上限 | 全量 inline，大文件靠模型自行 offset/limit |
| Aider | 只读文件全文 inline 无截断；repo-map 默认 1024 tokens 按 PageRank 裁剪 | 地图分片摘要，chat 文件永不裁剪 |

建议（三档 + 总额帽）：默认 **16KB**（约 4K tokens/400 行，对齐 Claude 30KB 的一半、opencode 50KB 的约 1/3，占 200K 上下文约 2%）；8KB 档用于多附件/移动端；32KB 档仅用户显式"读全文"；单轮 inline 合计不超过 64KB，超出转路径引用。折叠文案必须带三个数字（总量/已展示/截去量）+ 一个动作（展开/分段/搜索），例：`"该附件共 X 行 / Y KB，仅展示前 M 行。点击展开全文或分段读取。"`

### 9.2 PDF（二期）

首版拒绝，toast：`"暂不支持 PDF 解析，请粘贴文字或转为图片后发送"`。二期推荐 `unpdf`（unjs，0 依赖，约 1.6MB bundle，`extractText` 覆盖纯文本抽取，MIT）；备选 `pdf-parse` v2（需简单表格时，代价 20MB + `@napi-rs/canvas` 原生依赖）；`pdftotext` 系统二进制方案因双平台打包签名成本不建议。扫描件/多栏/表格超出纯文本抽取能力，一律走失败降级（不在二期做 OCR 与表格还原）。

## 10. bugfix 调研（2026-09-12，未实施）

### 10.1 审批通知"未见"：按设计实现，两道门叠加导致常见场景零弹窗

- 链路：`App.tsx:100` 常驻 `ApprovalNoticeBridge` → `approval-notice.ts` 扫全会话 pending 卡片 → toast 门（`ApprovalNoticeBridge.tsx:45`：与当前会话同 id 则抑制）→ OS 门（`notify-user.ts:13`：`document.hasFocus()` 则丢弃；设置默认开、双壳 capability 均开）。
- 用户"没看到"最大嫌疑：正盯着该会话（toast 被吃，只剩行内卡片）+ 窗口聚焦（OS 被吃）。按设计（§8）两门都是刻意的。
- 待确认：是否放宽（如聚焦时后台会话仍 toast 已有；是否要"同会话也给轻 toast"或"聚焦时也发 OS"）。
- 产品决策（2026-09-12）：**同会话也 toast**；OS 失焦门不动。

### 10.2 斜杠补全时机：裸 `/` 即弹是按设计（§2），用户要 `/skill:` 才弹

- 现状（`slash-menu.ts:21-45` + `Composer.tsx:142-155`）：行首/空白后 `/`（含 `/s`、`/sk` 等 partial）立即弹 skill+command 混合列表且 `query:""` 不过滤；完整 `/skill:`/`/command:` 后才按类过滤；`>>x` 走 agent。
- 待确认：改窄为"仅 `/skill:`/`/command:`（及 `>>`）触发"，裸 `/` 不弹；partial 前缀（`/s`）是否保留。
- 产品决策（2026-09-12）：**改窄**，裸 `/` 与 partial 前缀不再弹。

### 10.3 command 无内置：设计即无（§2 裁剪"只做项目级"），非回归

- 现状：`CommandStore` 单源（项目 `.spherse/commands/`）；`presets` 无 `commands/`；链路（server CRUD → `queries/commands.ts` → Composer/面板）完整，空目录即空列表。
- 待确认：是否补充内置（方案：`presets` 加 `commands/` + `PRESET_COMMAND_SOURCES`，`project.ts open/create` 透传多层，对标 `SkillStore` 多源；另需定内置与项目同名时的覆盖序 + i18n/文档）。
- 产品决策（2026-09-12）：**补充内置**，对标 SkillStore 多源；同名覆盖序待定（默认项目层优先）。
- 修订（2026-09-12）：**取消**——暂无需要的内置 command，不做。

### 10.4 重发编辑框缩小：`MessageItem.tsx:165` 固定 `rows={3}`，无自适应

- 普通 Composer 有 MIN 2 / MID 10 / MAX 20 自适应（`Composer.tsx:25-29,91-112`）；重发编辑器是独立小 textarea。
- 修法（待确认即做）：复用 Composer 自适应高度逻辑（抽 `useAutoGrowTextarea` 或照抄三档），内边距对齐气泡。
- 产品决策（2026-09-12）：**修**，复用 Composer 自适应高度。

### 10.5 桌宠无入口：步骤 1 入口遗漏，非 v2 范围

- 现状：进 pet 只有浮窗标题栏猫按钮（`FloatingFrame.tsx:112-121`，须先开浮窗）；退 pet 有形象圆按钮 + 悬浮条；首次永远 full（`open-chat.ts:16` + 无读恢复）；会话列表/右键/设置无直达项。
- v2（§7）仅 OS 窗口 + 形象上传，入口问题属步骤 1 遗漏。
- 待确认：入口放哪（推荐：会话行右键"以桌宠打开" + 浮窗标题栏猫按钮保留；是否需要设置默认模式）。
- 产品决策（2026-09-12）：**会话行右键加"桌宠模式"项**，猫按钮保留。另有 bug：浮窗标题栏猫按钮点了没反应（根因：`use-drag.ts:28` 的 `preventDefault` 吞 click；修法：猫按钮纳入 `ignoreSelector`，已修）。
- 语义确认（review 后，2026-09-12）：`floatSession` 不带 mode 落在已浮 pet 会话上保持 pet（no-op）；已浮行右键不加桌宠项（用标题栏猫按钮切换）。均为有意。
