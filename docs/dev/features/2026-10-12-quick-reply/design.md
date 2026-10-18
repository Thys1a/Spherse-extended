# agent 所属快捷回复：方案

- 日期：2026-10-18
- 状态：有方案，待评审（schema/入口/行为三处待定，见 §四）
- 版本：v1.0.1
- 来源：排期总览（用户直接提出，无出处）+ 本次代码现状核查（只读，未改代码）

## 一、结论摘要

1. 现状只有「快捷链接」（文件路径按钮），没有「快捷回复」（点即发消息的预设文本）；`quickLinks: string[]` 已是 per-agent 字段，但语义、配置 UI、聊天 UI 三层都不满足。
2. 路径（2026-10-18 已决策，2026-10-19 修订落定）：schema 定为 `{label, description, text, action}`（`action` 标注预留、当前仅 `fill`：点击填入输入框光标处、可再编辑后发送，直发不做）；CRUD 放在 agent 编辑页（**用户**操作，无权限门）+ LLM 经 `manage_agent` 改（已核实 `capabilities/agent-mgmt/index.ts:9` 走 `withApproval`，加参数即自动进审批）；校验下沉 core 解析层（对象解析 + `action` 枚举 + label/text 长度 + 条数上限，渲染层只做输入提示）；聊天 UI 为 Composer 上方 button 行（移动端横滚），每条目一 button；限值落定：最多 10 条，label ≤ 16 字符（落校验 + i18n 提示）。
3. 先澄清命名债：代码内无任何「全局快捷回复」实现，立项 README 的措辞按新建 per-agent 能力处理，不做全局迁移。

## 二、现状（file:line 实证）

- 数据：`quickLinks` 存 `profile.md` frontmatter（`data-conventions.md:98`），`core/src/types.ts:20-43`（`AgentProfile`）、`contracts/src/agents.ts`、server 详情端点透传（列表只下摘要）；`agent-markdown.ts:87-89,123-125` 解析/写回；`manage-agent.ts:64-69,281-284` 全量替换。
- 配置 UI：Agent Dialog「个性化」页 `PathListField`（`AgentDialogForm.tsx:90-98,243-250`，选文件路径；i18n `zh-CN.ts:445-449` 定语即文件）。
- 聊天 UI：`Header.tsx:39-63` 文件按钮行（文本 `basename` 去扩展名）；`QuickLinkPanel.tsx:9-13` 分流（移动端滑出预览 / 桌面开浮窗 / web 跳内容页），均不触 `Composer`；`Composer` 唯一程序化填入通道 `composer-insert-store.ts:1-21`，quickLinks 未接。
- 可用性：`hideHeader` 的浮窗/停靠（`FloatingChatContainer.tsx:113-117`、`DockedChatManager.tsx:99-107`）无快捷链接（design 已确认接受）；E2E `agent-quick-links.spec.ts` 覆盖整链，可仿写。
- 参照设计：`docs/dev/features/2026-09-19-agent-quick-links/design.md:51-89`；game-engine 调研早有「开场白/快捷回复声明式扩展」提议（`2026-09-17-game-engine/official-chat.md:12,40`）。

## 三、方案

1. 数据模型：`quickReplies: {label, description, text, action}[]`（已定；`label` 显示名限长、`description` 说明（tooltip/无障碍）、`text` 填入文本、`action` 仅 `fill` 保留扩展）；`AgentSummary` 本就排除详情字段，新字段走详情 query 即可；开关暂不加（`quickLinks` 无开关先例）。限值落定：最多 10 条，label ≤ 16 字符。
2. 写链：`agent-markdown.ts`、`manage_agent`（仿 `quick_links` 全量替换，走既有审批；有管理权限的 agent 可改）、contracts（`agentProfile` schema 加数组对象，TypeBox 限 `maxItems`/`maxLength`）、`agent-profile.ts` 过滤分支（`quickLinks` 现只 filter 字符串，新分支做对象解析 + 枚举 + 限值校验）各加一条；读链解析四字段并校验限值。
3. 配置 UI：Agent Dialog「个性化」页（即 agent 编辑页）新增快捷回复编辑器（增删改查；用户操作无权限门）+ i18n（走 i18n skill，限值进提示文案）。
4. 聊天 UI：Composer 上方 button 行（移动端横滚；每条目一 button，`label` 截断显示、`description` 进 title）；点击填入走 `composer-insert-store.ts:15-16`（插入光标处，不覆盖已有草稿，直发不做）。
5. 改动清单：`core/src/types.ts`、`agent-profile.ts`、`agent-markdown.ts`、`manage-agent.ts`、`contracts/src/agents.ts`、`AgentDialogForm.tsx`（新编辑器）、聊天回复条新组件、`data-conventions.md:98` 加字段行、三语 i18n。
6. 测试：仿 `agent-quick-links.spec.ts` 补 E2E + 单测（解析/写回/过滤，含限值用例）。

## 四、已决策（2026-10-18，2026-10-19 修订落定）

- schema：`{label, description, text, action}`，`action` 标注预留、当前仅 `fill`（点击填入光标处）。
- CRUD 在 agent 编辑页（用户操作无权限门）；LLM 经 `manage_agent` 改走 `withApproval`（已核实）。
- 入口：Composer 上方 button 行（移动端横滚）；`hideHeader` 浮窗/停靠默认不跟（同 `quickLinks`）。
- 「全局快捷回复」按不存在处理（命名澄清，不迁移）。
- 限值落定：最多 10 条，label ≤ 16 字符（落 core 校验 + 编辑器 maxlength + i18n 提示）。

## 五、测试

- 单测：markdown 解析/写回（含限值校验）、`agent-profile` 过滤、`manage_agent` 替换；组件：回复条渲染 + 点击填入（含光标插入、不覆盖草稿）；E2E：仿 quick-links 用例。
- 真机：桌面 button 行 + 移动端横滚；编辑页增删改查往返。

## 六、范围与不做

- 不改 `quickLinks` 语义与现有 UI；不做全局快捷回复迁移；开关暂不加；`hideHeader` 浮窗/停靠默认不跟。
