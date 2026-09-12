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
- 失败回退走现有 `_sendFailed` 条。无 contracts/server/core 改动。

## 5. 选择后右键菜单：复制/引用（批次 A）

- bubble 容器 `onContextMenu`：`preventDefault`，选区非空且双端（anchor+focus）落在当前 bubble → 轻量自绘 `SelectionMenu`（fixed div + portal body + `useDismissable` + 滚动关闭；未用 `components/ui/context-menu`，因 base-ui Trigger 需包裹每个 bubble 且 anchor 定位复杂，回迁条件为需要箭头键导航/焦点管理时）：复制 / 引用到当前会话。
- 复制：`navigator.clipboard.writeText(selectedText)`，不可用/拒绝弹 toast（`chat.selectionMenu.copyFailed`）。
- 引用：经 `composer-insert-store`（sessionId+text+nonce，消费确认防重放/双挂载复插）在 Composer 光标处插入 `` ```quoted `` md 代码块（用户可随意修改，围栏按内容自动加长），聚焦 Composer；无 sessionId 时隐藏引用项。首版不做可取消引用块 UI。
- HtmlCard iframe 内选区取不到父页面，作为已知 non-goal。
- desktop `setupContextMenu` 不动（bubble 区本就 early-return）。

## 3. 会话内快捷切换模型（批次 B）

持久覆盖与单次 override 是两套机制，分开实现：

- 会话模型（持久）：core `sessions` 表新增 `model` 列（沿 `store/session.ts:133` 的 ALTER TABLE 迁移先例）；`SessionManager` 持 per-session map 并落库；`buildAgent` 初始化/`restore`、 `getSessionStatus`（现只读全局 `defaultModel`，`session-manager.ts:143-160`）、`SessionInfo` contract 全部改读 `session > profile.model > global`。
- 单次 override（供 §2 命令 `model` 字段）：`ensureModel` 新增一次性入参，仅本 turn 生效，不入库。
- contracts：`PATCH /projects/:pid/sessions/:sid/model`，body `{modelId}`（空串表示清除覆盖），经 `ModelCatalog.resolveModelById` 校验；`SessionInfo`/`agentSummary` 加可选 `model`。
- server：`routes/sessions.ts` 加路由，通知 `SessionManager.setSessionModel()`。
- app：Composer 顶栏当前模型 pill 标记（显示 model 名/简写，点击展开下拉切换）；数据源 provider catalog，初值 `session.model || agent.model || global`；切换即调 API。历史中不追加系统消息。
- vision 模型：保持独立管理，不联动（用户在 Settings 单独切换）。

## 8. 系统通知（批次 C；手动提醒延 v2）

触发点：

1. 审批时：`ApprovalNoticeBridge.check()` 的 toast 处并行调 `hostBridge.notify(title, body)`；判定叠加窗口失焦（session 活跃但人不在屏幕前同样要通知）。
2. AI 提醒：`TriggerEventBridge` 的 `trigger_completed` 分支（已有 `notify` 判定，命名复用 trigger action 的 `notify`/`notificationMessage`）。

实现：host-bridge 加 `notify(title, body)` + `HostCapabilities.notification` 能力位 + `system-notification` 特性门；desktop 主进程 `new Notification().show()`，点击聚焦主窗并跳转相关会话，已聚焦时只 toast（Windows 需 `setAppUserModelId`）；web 用 `Notification.requestPermission()`，前台 toast、后台 OS 通知。`HostSettings.notifications: {approval, trigger}` + Settings 两个开关。不立独立插件层。

## 1. 会话附加文件（批次 D；§6 的前置）

首版范围：文本类（`text/plain`、`text/markdown`、`application/json`）；PDF 纯拒绝（toast 见 §9）。

- core：新增 `TextAttachmentProcessor`（读→大小检查→截断→ `{type:'text', content, truncated, originalSize}`），注册到 `attachmentCapability`（`PreparedContentBlock` 已有 `text` 分支，projector 透传）。截断预算与折叠策略见 §9。
- server：`routes/attachments.ts` 白名单扩到文本三类；分级上限（图片 5MB，文本 2MB）；PDF 上传 400；`preview.ts` 按扩展名放行文本类（`text/plain; charset=utf-8`）；新增 `/attachments/:id/download`。
- app（多附件重构，§6 依赖本节）：`types.ts` 放开 `type: string`；`sendMessage` 全链改 `attachments[]`（types、`api.uploadAttachment`、`chat-session-runtime`、`streaming-store` 乐观 `_attachments`）；Composer `accept="*"` + `AttachedFile[]`（图片走 `compressImage`，其他直传）；AttachmentBar 加文件行（图标+名+大小+删除）；MessageAttachments 非图片渲染下载链接。
- 接受行为：附件正文与图片同生命周期——会话内存中有效，`stripUserAttachments` 剥离持久化，重启/restore 后上下文不再含附件正文。

## 2. 斜杠命令（批次 F，与 summon 共用 meta 扩展）

范围裁剪：**完全不做 `!cmd`**；`/command:` **不做 agent/subtask 字段**（不与功能 4 联动）；**管理 UI 要做**；命令只做项目级 `.spherse/commands/`（`SkillStore` 无全局层先例，全局目录不做）。

- core：新建 `CommandStore`（镜像 `SkillStore` list/get）；frontmatter 仅 `{description?, model?}`；纯函数 `SlashResolver` 解析 `^/(skill|command):(\S+)(?:\s+(.*))?$`；展开器：`/skill:` 复用 `SkillStore.get` + `load-skill` 拼装格式，`/command:` 展开 `$ARGUMENTS`/`$1..`/`@path`（`@` 走 read + access policy + §9 截断预算），缺参数抛 ValidationError；展开点为 `AgentRunner.sendMessage` 前（`deps.projectStore` 可达 agentStore，不破坏 capability 分层）；`model` 字段走 §3 的单次 override。
- 事件扩展（与 §4 summon 共用一次改动）：`user/message` data 加 `slashMeta?: {type, name, rawArgs}`，同步 `fold.ts`、contracts、`chat-wire-projector`、reducer pill 渲染。
- contracts：`CommandDefinition` schema + list/get API；server：CRUD + resolve 路由。
- app：Composer 输入 `/` 弹出补全（skill + command 列表，显示 description 与 model 徽标）；未知名称 toast 不发送；历史凭 `slashMeta` 显示原始 `/skill:x` pill。
- 管理 UI：左侧栏 Commands 面板（与 Skills 同级）：列表（名+description）+ 新建/编辑（textarea，与现有内容编辑一致，不引入 monaco 依赖）/删除，复用 skill-panel 结构。
- 安全：命令文件视为不可信输入；每次使用重读；路径走 `resolveProjectPath`/`assertInsideProject`。

## 4. 召唤另一个 agent（批次 G，依赖 F）

新语法（fire-and-forget，当前会话不等待、不回注）：`>> <agent-slug> <message>`。

- 拦截层（审查修正）：**不经过 `AgentRunner.sendMessage`**（否则当前 agent 会对字面 `>>` 文本跑 turn）。拦截点在 server `ws-chat` message 分支（首选，多端一致）或 app `streaming-store.sendMessage`：命中 `^>>\s*(\S+)\s+(.+)$` 即走召唤路径，不启动当前 run。
- 目标会话：`SessionPort.createSession(slug, 'new')` + `sendMessage(message)` 后立即返回（文本-only，`SessionPort.sendMessage` 无 attachments 签名，`kernel/ports.ts:16`）。
- 持久化记录（已决策）：当前会话落一条 `user/message`，data 扩展 `source: "summon"` + 目标 `sessionId/agentId`（复用批次 F 的事件扩展），reducer 渲染为可点击跳转的召唤卡片（`openSession(newSessionId)`）。
- contracts/server：事件 schema 扩展（F 已含）；无新路由（复用建会话+发消息）。
- app：Composer 输入 `>>` 显示 agent 补全下拉；未知 slug toast。
- 与 trigger 的区别：trigger 是事件驱动自动化，`>>` 是用户主动即时召唤。

## 7. 桌宠模式（批次 H，仅步骤 1；OS 窗口 + 形象上传延 v2）

步骤 1（纯 renderer 外观态）：`floating-chat/store.ts` 加 `mode: 'full'|'pet'`（localStorage）；`FloatingFrame` pet 变体（隐藏标题栏/resize，只留形象区 + 迷你单行 Composer）；主题链不变；未上传形象用 agent 头像（首字母圆形）。

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
