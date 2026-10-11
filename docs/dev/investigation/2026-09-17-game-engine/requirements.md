# 游戏引擎方向需求文档

调研时间：2026-09-17
来源：同目录 `README.md` + `official-chat.md` / `sillytavern.md` / `js-slash-runner.md` / `mvu.md`；另含本地 dev 新增的 `.card.json` 世界书能力（`docs/dev/features/2026-09-15-card-json-app-layer/design.md`）
目标：为聊天带来更多互动性，补齐“游戏引擎”最小可用闭环与聊天窗口定制能力。
状态：需求阶段，未进入 design；范围确定后毕业为 `docs/dev/features/{date-game-engine}/design.md`。

许可红线：SillyTavern 与 MVU 系为 AGPL-3.0，JS-Slash-Runner 为 Aladdin 自定义许可——只学思路、不搬代码。

## 1. 背景与目标

SillyTavern 生态证明“聊天 + 结构化变量 + 规则 + 常驻 GUI”可构成可玩的游戏引擎（MVU 链路见 `mvu.md`；STscript/Quick Replies 见 `sillytavern.md`；渲染与变量见 `js-slash-runner.md`）。Spherse 已有对等零件（`HtmlCard` iframe、`$manifest` schema 校验、`data.mutate` 共入口 DataStore、trigger 系统），缺的是三处组装件。本需求文档把缺口落成可验证条目。

## 2. 现状基线（已按代码核实）

### 2.1 已有能力（不重复造）

- 状态 schema 校验：`$manifest` mutations + `validateMutationArgs`（`packages/core/src/capabilities/data/validate.ts:27-91`），失败抛 `DataValidationError` 附 fields 明细；server 映射 400（`packages/server/src/routes/data.ts`）；建模 skill `spherse-build-data-app` 已承载工作流。
- 写入保障：auto uuid/nowIso、内存幂等 key、原子落盘、写锁、sha256 version + ifVersion 乐观锁、20MB 上限、变更事件带 origin（`packages/core/src/capabilities/data/data-store.ts`）。
- trigger：`time`（cron，10 分钟粒度轮询）+ `event`（精确名匹配）两类，三种 session 模式（new/existing/reusable），消息模板变量，桌面通知（`packages/core/src/trigger/`）。
- `sp:` 保留前缀已声明（`packages/core/src/trigger/validation.ts:3`），但 `TriggerManager.onUserEvent` 直接丢弃（`packages/core/src/trigger/trigger-manager.ts:74`）。
- Composer：Enter 发送 + 触屏区分（`packages/app/src/features/chat/Composer.tsx:43,357-367`）、三档自动增高 + 手动展开（`:25-29,91-112,378-388`）、streaming 变停止键 + send 守卫（`:198,399-409`）。
- 消息列表：column-reverse 贴底 + 回到底部 FAB（`packages/app/src/features/chat/MessageList.tsx:90,122-133`）。
- 错误呈现：行内 `ErrorMessageSection`（`data-chat-error`）+ retry，不锁输入（`packages/app/src/features/chat/ErrorMessageSection.tsx`）。
- 主题：三级层叠 + 约 20 个 `data-chat-*` 钩子（见 `features/chat` 各文件与 `docs/official/architecture/theming.md`）；agent 主题相对资源 `url()` 已重写为 preview 绝对地址（`features/chat/hooks/useAgentTheme.ts`，`prepareAgentThemeCss` / `rewriteThemeAssetUrls`）。
- 世界书（`.card.json`）读写：页面 `spherse.card.*`（10 方法）+ Agent `read_card` / `search_card` / `edit_card`，对标 ST WorldInfo 的 CRUD 部分；三档检索 + use_regex + snippet；原子写 + 白名单字段；SDK 配额已放宽至 300 次/60s（`packages/app/src/ui-sdk/rate-limit.ts:1`）。
- 浮窗承载任意文件：`floatContent` / `unfloatContent`（`app/src/ui-sdk/handlers/float-content.ts:5`）+ `features/floating-content-browser/`（localStorage 读写回、级联定位、按项目；文件面板一键浮窗 `user-file-panel/index.tsx:99-100`；SDK 可调，web 壳降级跳转）；浮窗内为 `ContentView` 预览（含 HTML），滚动聊天仍可见——常驻位已有能力，无需新建。

### 2.2 真实缺口（4 条）

1. `fields` 仅 5 种标量（`manifest.ts:12-24`），无嵌套 object/array——无法建模队伍、背包、多角色属性。
2. manifest 非法条目静默丢弃（`manifest.ts:63,76` `continue`），游戏作者写错 schema 无反馈。
3. turn 边界无人 emit 事件——规则无法按回合自动跑。
4. 世界书条目不会自动参与 prompt——`cardCapability` 只贡献 `tools`，无 `contextBlocks`（`packages/core/src/capabilities/card/capability.ts:8-27`）；对照组 `memory`（`capabilities/memory/index.ts:39`）、`time-perception`（`:22`）、`skill`（`:18`）均实现该接口（定义见 `kernel/capability.ts:32`）。即 `keys` / `secondary_keys` / `constant` / `selective` / `insertion_order` / `position` / `enabled` 只存不消费，Agent 必须显式 `search_card` 才能取到设定。

### 2.3 两类数据载体约定

| 载体 | 用途 | 校验 | 通道 |
|---|---|---|---|
| `*.data.json` | 业务状态（数值、列表） | `$manifest` schema 校验 | `data.*` / `read_data` / `query_data` / `mutate_data` |
| `*.card.json` | 世界书条目（设定文本） | 无 schema，仅固定 spec + 字段白名单 | `card.*` / `read_card` / `search_card` / `edit_card` |

游戏状态写 `data.json`、设定文本写 `card.json`，实现时不得选错载体。

## 3. 需求清单

字段说明：每条含描述 / 现状 / 验收标准 / 依赖 / 优先级（P0 最小可用，P1 重要，P2 后续）。

### E1 状态引擎补全

**R1.1 manifest `fields` 支持嵌套 object 与 array-of-object（含元素级 type/required/enum）**
现状：仅 string/integer/number/boolean/enum 标量（`manifest.ts:12-24`，`validate.ts:6-21`）。
验收：可声明「队伍→成员数组→hp/level」并通过 `mutate_data` 写入；非法嵌套值返回 `DataValidationError` 附字段路径。表达上限锁定 L1（结构 + 元素类型 + 必填，对齐 MVU 实际用量；跨字段引用、条件 required、完整 JSON Schema 子集一律不做，见 §6）。
依赖：无。优先级：P0。

**R1.2 manifest 非法条目从静默丢弃改为可诊断错误**
现状：缺 path 或非法 op 的 query/mutation 被 `continue` 丢掉，只落健康度 stale/invalid（`manifest.ts:63,76`，`checkManifestHealth:101-123`）。
验收：`read_data` 或工具返回条目级 + 原因级诊断（如 `mutations.hp_curve: op must be one of …`）。
依赖：无。优先级：P1。

**R1.3 manifest 版本迁移路径**
现状：`version` 仅支持 1（`manifest.ts:52,57`）。
验收：R1.1 落地时旧文件行为已定义（拒绝并提示 / 自动兼容其一）。
依赖：R1.1。优先级：P2。

**R1.4 明确 `data.set`/`rawSet`/`edit_file` 绕过校验的边界**
现状：三条路径完全无 schema 校验（其中 `edit_file` 是 `$manifest` 唯一演化路径）。
验收：二选一——文档与 skill 显式声明为“有意保留的演化通道”，或补写时告警。
依赖：无。优先级：P2。

### E2 回合事件自动化

**R2.1 core 在 turn 边界 emit `sp:` 内部事件**
现状：全仓无任何代码 emit `sp:` 开头事件；唯一回合 hook 是 `agent_end` 的 `onAssistantTurnComplete`（仅 TTS 消费）。
验收：仅三事件——`sp:user-message` / `sp:assistant-message` / `sp:turn-end`，可在 trigger 日志中观察到；payload 含 sessionId/agentId。tool-call 级需求走 capability 中间件，不经 trigger；流式 message 事件禁止接入 trigger fire（见 §6）。
依赖：无。优先级：P0。

**R2.2 `TriggerManager` 放行并消费 `sp:` 事件**
现状：`onUserEvent` 首行丢弃（`trigger-manager.ts:74`）。
验收：可配置「收到 AI 消息后触发」并实际 fire；沿用现有三种 session 模式与审批语义。
依赖：R2.1。优先级：P0。

**R2.3 TriggerForm 提供内部事件选择器**
现状：事件名手填文本。
验收：UI 可选 `sp:*` 事件，下拉含说明。
依赖：R2.2。优先级：P1。

**R2.4 防重入与防自触发循环**
现状：仅同 trigger id 的 `isRunning` 去重（`trigger-manager.ts:80`）。
验收：trigger 触发新一轮又触发自身时有深度上限或环路保护，不出现无限连锁。
依赖：R2.2。优先级：P1。

### E3 状态面板刷新联动

（R3.1 常驻位已删除：`floatContent` 浮窗已有同等能力，见 §2.1；侧栏/顶部条等其余面板形式需求归 E5 聊天窗口定制覆盖。）

**R3.2 卡片与 data 变更联动，自动重渲染**
现状：消息流 `HtmlCard` 无 `file:update` 监听；浮窗 `ContentView` 仅自身文件变化刷新，关联 `.data.json` 变更不触发 HTML 重取；卡片需自行轮询或订阅。
验收：`data.mutate` 成功后关联卡片（消息流内/浮窗）即时刷新，无需手动重载。
依赖：无。优先级：P1。

### E4 聊天窗口定制 A 档（不动架构）

**R4.1 补 `data-chat-*` 钩子**
现状：约 20 个 panel 级钩子，无 welcome 位、无 tool call/卡片内部结构钩子。
验收：新增钩子清单 + 同步 `agent-theme-template.css` 与两个 theme skill（`theming.md` 同步契约）。
依赖：无。优先级：P1。

**R4.2 Agent config 声明式扩展**
现状：config 无快捷回复、开场白列表、placeholder、背景/遮罩参数。
验收：Agent 可声明 qrList（对标 official-chat `qrConfig`）、开场白、输入占位与背景参数，renderer 生效。
依赖：R4.1（部分）。优先级：P1。

**R4.3 skill 同步**
现状：`spherse-create-agent-chat-theme` / `spherse-create-ui-theme` 只覆盖现有钩子。
验收：R4.1/R4.2 落地即同步 skill 文档。
依赖：R4.1/R4.2。优先级：P1。

### E5 聊天窗口定制 B 档

**R5.1 Agent 带 `chat.html` 经 iframe 链路替换整窗**
现状：无；HtmlCard 只承载消息内卡片。
验收：host 新增 `chat.*` 只读+订阅族（`messages.list/subscribe/send/retry/withdraw` + runtime 上下文），SDK 封装 `useSpherseChat()`；缺失/报错/超时降级回默认 `Chat`；作用域沿用 project→agent 层叠；仅项目本地文件可声明。
依赖：E3（iframe 链路经验）。优先级：P2（E1–E3 验证后再评估）。

### E6 交互模式补齐（已核查，只剩 3 条）

核查结论（`Composer.tsx` / `MessageList.tsx` / `ErrorMessageSection.tsx` / `SendFailedBar.tsx` 已读）：Enter 发送、触屏区分、自动增高、生成中状态、滚动锚定 Spherse 已有（且多处更强），**不列为需求**。剩余：

**R6.1 错误态输入锁定（panic）**
现状：official-chat 用 PanicContext 在 saveFailed/error 时禁用输入区；Spherse 错误行内展示 + retry，不锁输入。
验收：持久化失败或致命错误时输入区明确禁用并提示原因，避免用户在坏状态下继续发送。
依赖：无。优先级：P2。

**R6.2 swipe 多候选**
现状：全仓无 swipe；语义只有 retry-last/resend/withdraw。
验收：同一位置多版 assistant 回复可左右切换；与现有 retry/withdraw 语义无冲突。多版本数据存 event log（与消息同寿命；分支带走 active 版；切换记新事件）。
依赖：无。优先级：P2（改动面大：reducer + 持久化 + UI）。

**R6.3 删除 AI 消息连带删上一条 user 并回填草稿**
现状：只有 withdraw 截断 + 单条 editable 编辑。
验收：删 AI 回复时上一条 user 消息一并移除、其内容回填输入框。
依赖：无。优先级：P2。

### E7 世界书自动激活注入（新增：本地 dev 世界书能力暴露的新缺口）

**R7.1 card capability 贡献 `contextBlocks`**
现状：只贡献 `tools`，条目字段只存不消费；Agent 必须显式 `search_card`。
验收：按会话消息文本扫描条目 keys（含 secondary_keys/selective 逻辑），命中条目按 `insertion_order` / `position` 注入；`constant` 恒注入；`enabled: false` 不注入。
依赖：无。优先级：P1（第二批，见 §6）。

**R7.2 扫描预算**
现状：无（大卡实测 1.8MB / 292 条）。
验收：注入 token/条目数上限已定义并生效，不撑爆上下文。
依赖：R7.1。优先级：P1。

**R7.3 顺序约定**
现状：`<skill-content>` / `<memory>` / `<time>` 块已有各自位置。
验收：世界书注入块与三者的位置与作用域关系已定义。
依赖：R7.1。优先级：P2。

## 4. 依赖关系与最小可用集

游戏化最小可用 = **R1.1 + R2.1/R2.2**：“存得下、跑得动”；“看得见”由现有 `floatContent` 浮窗承载（§2.1），R3.2（联动刷新）为 P1 跟进。E4 可独立并行；E5 待 E1–E2 验证后再评估（并覆盖其余面板形式）；E6 独立小项；E7 定为第二批，过渡期用显式 `search_card`。

跨切面约束：新工具对存量 agent 不可见——模板只惠及新建 agent，现有项目 agent `.md` 需手动加工具名（`2026-09-15-card-json-app-layer/design.md:283`，card 三工具同例）。任何依赖新工具的需求（E7 及后续）都继承此约束，design 阶段需明确迁移/提示策略。

## 5. 非目标

- 不往主 renderer 注入 JS（打破隔离与结构测试，与 `ui-sdk.md` 安全模型冲突）。
- 不做 STscript 式通用脚本语言（Composer 保持 `/skill:` `/command:` `>>` 三 token；command 模板变量保持 `$ARGUMENTS`/`$1..$9`/`@file` 现状）。
- 不引入 zod——嵌套校验沿 TypeBox/手写路线延展（`@sinclair/typebox` 已是三包直接依赖；zod 仅传递存在，未被 import）。
- 不改 trigger 现有 `time`/`event` 语义与审批链，只新增 `sp:` 事件源。

## 6. 开放问题（2026-09-17 已全部拍板，结论如下）

1. R1.1 嵌套上限：**L1**——结构 + 元素类型 + 必填，对齐 MVU 实际用量；跨字段引用、条件 required、完整 JSON Schema 子集不做。
2. `sp:` 事件粒度：**粗三事件**（user/assistant/turn-end）；tool-call 级走 capability 中间件；流式事件禁止接入 trigger。
3. R3.1 已删除：`floatContent` 浮窗已有同等能力（§2.1），不再新建；侧栏/顶部条等其余面板形式需求归 E5（`chat.html` 整窗替换）覆盖。
4. R6.2 存放：**event log**（与消息同寿命；分支带走 active 版；切换记新事件）。与 backlog 会话分支项的关系在立项时一并定义。
5. E7 批次：**第二批**——首批保持 R1.1 + R2.1/R2.2 + R3.1 + E4 并行；E7 待闭环验证后立项，过渡期用显式 `search_card`。
