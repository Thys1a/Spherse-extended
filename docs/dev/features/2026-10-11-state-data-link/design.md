# 状态数据外链（state data link）

- 日期：2026-10-11
- 状态：已商定，待实现
- 排期：与 v1.0.x worldbook 位置修正**同批**（共用「插到当前用户消息之前」的 helper）
- 关联：`docs/dev/investigation/2026-10-06-cross-project/06-tavern-vs-agent.md` §五 #4；同构参考 `docs/dev/features/2026-09-27-agent-card-links/design.md`

## 背景与目标

游戏 / 角色扮演 Workspace 需要把「当前状态」（数值、旗标、变量）随每轮注入 prompt，让模型据状态决定走向（酒馆式「变量驱动状态机」）。Spherse 现状：

- `.data.json` 只存不注入——没有 data projector，`convertToLlm` 的 projector 只有 attachments / card(worldbook) / tool-output-budget。
- worldbook（`.card.json`）能逐轮注入，但格式是 SillyTavern 卡，不适合当"状态存储"。

目标：给 `.data.json` 一个**外链注入**通道——把好编辑的项目 `.data.json` 软链入 agent 目录，其中用保留键声明要注入的子树；projector 每次 LLM 调用把它渲染成 `<state>` 块、插到当前用户消息之前。

写入侧零新增工具：沿用 `data` / `mutate_data`（有归因 + `rollback_turn` 覆盖）。

## 已确认的产品决策

1. 外链载体：**符号链接**（复刻 card 外链）。
2. 注入路径来源：**文件内声明**（保留键）。
3. 注入位置：**当前用户消息之前**。

## 决策

| 决策点 | 结论 |
|---|---|
| 链接载体 | `.data.json` symlink 进 `.spherse/agents/{slug}/`；链接名须以 `.data.json` 结尾、不含路径分隔符；目标须项目内已存在文件（`resolveProjectPath` + `isPathInside`，防链到项目外敏感文件进上下文）。新模块 `capabilities/data/state-link.ts`，镜像 `worldbook.ts` 的 `list/add/removeAgentCardLink` |
| 文件内声明 | 保留键 `$state`：`{ "path": "_state", "label"?: string, "enabled"?: boolean }`。`$` 前缀键已被平台保留（SDK 拒写、`data.keys`/`data.entries` 不返回、dot-path 不可达、`writeRaw` 抛 `ForbiddenKeyError`），普通数据工具读写不到它；专用读取用 `getRawByDotPath(doc, "$state")` 取声明，再用 `getByDotPath(doc, path)` 取目标子树 |
| 注入侧 | `dataCapability.contextProjectors` 新增 `stateProjector`：扫 agent 目录下 `*.data.json` 链接 → 读 realpath → 解析 `$state` → 渲染 `<state label="…">…</state>`；mtime 指纹缓存（同 worldbook）；无 `$state`／`enabled:false` 的链接跳过 |
| 注入位置 | 先剥离历史中所有 `<state>…</state>` 块，再把新块插到**最后一条 `user` 消息之前**（无 user 消息则追加）；与 v1.0.x worldbook 位置修正共用同一「插到当前用户消息之前」helper |
| 读取侧重读 | 每次 LLM 调用重读（`convertToLlm` 逐次运行，`agent-loop.js` 工具结果后再次调用），与 worldbook 一致；外链目标改动即时生效 |
| 写入 | 零新增写工具：`mutate_data`（`$manifest` 的 `set`/`update`，path 指 `_state`）或 `rawSet` / `edit_file`；归因 + `rollback_turn` 覆盖（data 已支持） |
| manage_agent | 新增 `link_data` / `unlink_data` action（镜像 `link_card` / `unlink_card`，参数复用 `path`），纳入 `isManageAgentWriteAction` 走审批 |
| Server 路由 | `GET / POST / DELETE /api/projects/:projectId/agents/:id/data-links`，镜像 card-links；contracts 加 schema 并走 `parseContract`；name 进 path 前做 basename 校验防 `../` |
| UI | AgentDialog 新增 `AgentDataLinksField`（镜像 `AgentCardLinksField`，悬空态展示；create 模式无 agentId 不渲染） |
| i18n | 新增 key 三地齐全（`agent-dialog.dataLinks*` 前缀），build 后校验 `TranslationKey` 自洽 |
| 预算 | 单块上限（约 2000 token / 8KB），超限截断并标注；多链接拼接，总预算封顶 |

## 非目标

- 项目外目标、目录链接（同 card 外链）
- 多路径注入 / 通配匹配（本期只支持单个 `$state.path`；需要多块可后续扩展为 `$state: [...]`）
- 系统派生状态（时间 / 骰子 / 计数）自动注入（另议）
- `edit_file` / `write_file` 直写 `$state` 的防护（fs 工具不校验保留键，文档说明即可）

## 测试计划

- core：外链跟随读取、越界目标拒绝、坏链跳过、无 `$state` 跳过、`<state>` 块替换不累积、插入位置（最后 user 之前）、预算截断、mtime 指纹感知目标改动
- server：三路由契约 + 越界 / 非法名 4xx
- tool：`link_data` / `unlink_data` 审批门分类 + 成功 / 失败路径
- app：AgentDialog 链接增删交互（沿用 AgentCardLinksField 既有测试模式）

## 开放问题

- 版本号细节（与 v1.0.x 具体 patch）待世界书位置修正一并定。
- 多链接时是否在 `<state>` 上标注来源文件 / 链接名以便区分。

## 文档同步

- `06-tavern-vs-agent.md` §五 #4、`README` 判定：把「不吸收为内核机制」更新为「通用机制方案（state 数据外链），见本 design」。
- `data-conventions.md`：新增「状态数据外链与 `$state` 约定」一节。
- `architecture/capabilities.md`：data capability 增 `contextProjectors` 一行。
