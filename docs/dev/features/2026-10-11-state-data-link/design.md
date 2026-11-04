# 状态数据外链（state data link）

- 日期：2026-10-11
- 状态：已商定，待实现
- 排期：独立实施（原「与 v1.0.x worldbook 位置修正同批」已失效：worldbook 默认即插到当前用户消息之前）
- 关联：`docs/dev/investigation/2026-10-06-cross-project-v1/06-tavern-vs-agent.md` §五 #4；同构参考 `docs/dev/features/2026-09-27-agent-card-links/design.md`


### 状态注记（2026-11-02，分支 `feat/native-float-state-data-link` 复核）

- 实现状态：**仍为零实现**——`link_data` / `$state` / `stateProjector` / `data-links` 路由与契约 / `AgentDataLinksField` 全仓库无命中，design.md（“已商定待实现”）依然有效。
- 镜像前提全部存活，可直接开工：
  - card 外链三件套：`list/add/removeAgentCardLink`（`capabilities/card/worldbook.ts:288,320,383`），symlink 创建含 Windows 权限不足的明确报错（`:363-368`）。
  - “插到当前用户消息之前”helper：`userSegmentIndex`（已移至 `capabilities/shared/user-segments.ts`，`card/index` 保持 re-export；能力目录互 import 禁止）。
  - data 侧工具齐备：`getRawByDotPath`（`dot-path.ts:83`，读 `$state` 声明用）、保留键机制（`isReservedSegment` 以 `$` 开头，`stripReservedKeys`）、`resolveDataFile`/`isReservedKey`、`read/mutate/query` 全套工具（含归因与 `rollback_turn` 覆盖）。
  - `contextProjectors` 机制：`capability.ts:35`＋`agent-assembly.ts:61`，data capability 只需追加 `stateProjector`。
  - `manage_agent` 有 `link_card`/`unlink_card`＋审批先例；card-links 有 server 路由＋contracts（`agents.ts:94,127-132`）＋`AgentCardLinksField` UI 模式可抄。
- 开工前唯一待修：design §“文档同步”引用的跨项目文档旧路径（`2026-10-06-cross-project/06-...` → 已更名 `cross-project-v1`），实施时顺手修。


### 修订注记（2026-11-04，最终方案确认）

- 以下 §决策 / §测试计划已按确认结论修订，与初版不一致处以本节为准。
- 已定：插入位置方案 A（`userSegmentIndex(messages, 1)`，无 user 消息返回 0）；取消预算上限、仅做预估 token 提示；`link_data` 由平台写 `$state`（默认 `_state`，已有合法声明不覆盖）；UI 无 `enabled` 开关、无 `statePath` 输入。
- research 结论（与初版描述的偏差）：
  - 注入只在 `convertToLlm` 临时生效，不落 eventLog，无需“剥离历史 `<state>` 块”。
  - `$state` 声明必须直接读 `doc["$state"]`，`getRawByDotPath(doc, "$state")` 因 `splitDotPath` 拒绝 `$` 段而读不到。
  - 链接路径被 data `path-guard` 禁写，模型只能按目标项目相对路径回写，故 `<state>` 必须带 `file` 属性。
  - `persistLocked` 的 temp+rename 若作用于链接路径会把 symlink 换成普通文件；当前因 path-guard 禁写而碰不到，记 backlog。


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
| 文件内声明 | 保留键 `$state`：`{ "path": "_state", "label"?: string, "enabled"?: boolean }`。`$` 前缀键已被平台保留（SDK 拒写、`data.keys`/`data.entries` 不返回、dot-path 不可达、`writeRaw` 抛 `ForbiddenKeyError`），普通数据工具读写不到它；专用读取直接取 `doc["$state"]`（`splitDotPath` 拒绝 `$` 段，`getRawByDotPath` 读不到），再用 `getByDotPath(doc, path)` 取目标子树 |
| 注入侧 | `dataCapability.contextProjectors` 新增 `stateProjector`：扫 agent 目录下 `*.data.json` 链接（只认 symlink，按名排序）→ 读 realpath → 解析 `$state` → 渲染 `<state file="目标项目相对路径" path="…" label="…">…</state>`；mtime 指纹缓存（同 worldbook）；无 `$state`／`enabled:false`／解析失败的链接跳过。注入只在 `convertToLlm` 临时生效、不落盘，无需剥离历史块；worldbook 的 `recentTextOf` 补剥离 `<state>` 防关键词误触发 |
| 注入位置 | 多链接合成**一条** user 消息，插到 `userSegmentIndex(messages, 1)`（无 user 消息时返回 0 插最前，与 worldbook 一致）；已定方案 A |
| 读取侧重读 | 每次 LLM 调用重读（`convertToLlm` 逐次运行，`agent-loop.js` 工具结果后再次调用），与 worldbook 一致；外链目标改动即时生效 |
| 写入 | 零新增写工具：`mutate_data`（`$manifest` 的 `set`/`update`，path 指 `_state`）或 `rawSet` / `edit_file`；归因 + `rollback_turn` 覆盖（data 已支持）。一律按目标项目相对路径写，链接路径被 path-guard 拒绝 |
| manage_agent | 新增 `link_data` / `unlink_data` action（镜像 `link_card` / `unlink_card`），参数复用 `path` 并加可选 `state_path` / `label`；`link_data` 由平台写 `$state`（显式传 `state_path` 则用之，目标已有合法声明则保留，否则写 `{path:"_state"}` 并创建空节点）；`unlink_data` 只删链接、不改目标文件；纳入 `isManageAgentWriteAction` 走审批 |
| Server 路由 | `GET / POST / DELETE /api/projects/:projectId/agents/:id/data-links`，镜像 card-links；contracts 加 `dataLink`（`name/target/dangling/hasState/statePath/estimatedTokens`）并走 `parseContract`，AddRequest 含可选 `statePath` / `label`；name 校验交 core（basename 校验防 `../`，400/404 对齐 card） |
| UI | AgentDialog 新增 `AgentDataLinksField`（镜像 `AgentCardLinksField`，悬空态展示；create 模式无 agentId 不渲染）；无 `enabled` 开关、无 `statePath` 输入（默认 `_state`，需自定义走 `manage_agent` / API） |
| i18n | 新增 key 三地齐全（`agent-dialog.dataLinks*` 前缀），build 后校验 `TranslationKey` 自洽；token 提示措辞显式「约 / est.」 |
| 预算 | 无上限截断（与 worldbook v1.0.3 一致）；`list` / `add` 返回 `estimatedTokens`（渲染块经 `estimateTokens`，跳过/dangling 为 0），UI 显示约数与占窗口比 |

## 非目标

- 项目外目标、目录链接（同 card 外链）
- 多路径注入 / 通配匹配（本期只支持单个 `$state.path`；需要多块可后续扩展为 `$state: [...]`）
- 系统派生状态（时间 / 骰子 / 计数）自动注入（另议）
- `edit_file` / `write_file` 直写 `$state` 的防护（fs 工具不校验保留键，文档说明即可）

## 测试计划

- core：外链跟随读取、越界目标拒绝、坏链/普通文件跳过、无 `$state` 跳过、`enabled:false` 跳过、节点缺失跳过、`$state` 默认 `_state` 且不覆盖已有声明、写 `$state` 不破坏其它键、多链接排序稳定、`<state>` 位置（最后 user 之前、无 user 插最前）、`file` 属性为目标相对路径、token 估算、mtime 指纹感知目标改动、worldbook 关键词扫描看不到 `<state>` 内容
- server：三路由契约 + 越界 / 非法名 4xx
- tool：`link_data` / `unlink_data` 审批门分类 + 成功 / 失败路径
- app：AgentDialog 链接增删交互（沿用 AgentCardLinksField 既有测试模式）

## 开放问题

- （已决）版本号细节：worldbook 位置修正已完成，本特性独立实施。
- （已决）多链接区分：`<state>` 用 `file` 属性标注目标项目相对路径，该路径同时是模型回写依据。

## 文档同步

- `06-tavern-vs-agent.md` §五 #4 与同目录 `README`：已核实两者均含「通用机制方案（状态数据外链）」verdict 并链接本 design，无需改动（历史 investigation 文档按 doc-sync 规范保持原样）。
- `data-conventions.md`：新增「状态数据外链与 `$state` / `_state` 约定」一节（含 `$state` 只能手写或经 `link_data`、 `_state` 可用数据工具回写、回写路径说明）。
- `architecture/capabilities.md`：data capability 增 `contextProjectors` 一行。
