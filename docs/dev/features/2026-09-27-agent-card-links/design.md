# Agent 世界书外链（card links）

- 日期：2026-09-27
- 状态：已商定，待实现

## 背景与目标

世界书自动注入要求卡文件放在 `.spherse/agents/{slug}/` 顶层，但该目录是隐藏的 agent 管理目录，用户与 agent 都不方便在里面反复改卡。目标：允许把外面好编辑的 `.card.json` 以**软链接**形式链入 agent 目录，改外面文件即时同步到注入（worldbook 逐轮指纹复核天然覆盖）。

分阶段：本期只做软链接支持 + 创建入口；`worldbook_sources` 配置化以后按需再议。

## 已确认的产品决策

1. 分阶段：先纯软链接支持（含创建入口），后续再按需加配置/UI。
2. 创建入口两处：① 编辑 agent 对话框新增入口；② 可管理 agent 的助手 agent 也能填（走 `manage_agent` 工具新 action，与现有审批链一致）。

## 决策

| 决策点 | 结论 |
|---|---|
| 链接载体 | 文件系统 symlink 本体，无 schema 变更。链接名必须以 `.card.json` 结尾且不含路径分隔符；目标须为项目内已存在文件（`resolveProjectPath` + `isPathInside` 守卫，防链到项目外敏感文件进 LLM 上下文） |
| 读取侧 | `worldbook.ts` 的 `loadAgentCards` / `fingerprintDir` 本就经 `readFileSync` / `statSync` 跟随链接，只需显式化：坏链/非文件目标跳过（已有 try/catch 风格），`lstat` 识别链接用于列表展示；单测钉住跟随、越界拒绝、坏链跳过 |
| Core API | `worldbook.ts` 新增 `listAgentCardLinks(projectRoot, slug)`（含悬空标记）、`addAgentCardLink(projectRoot, slug, targetRelPath)`（名取 target basename，存在则幂等成功）、`removeAgentCardLink(projectRoot, slug, name)`（只删链接本体）；Windows 建链 EPERM/EACCES 转明确错误，EEXIST 转 Conflict |
| manage_agent | 新增 `link_card` / `unlink_card` action（参数复用 `path`：link 时为目标相对路径，unlink 时为链接文件名），纳入 `isManageAgentWriteAction` 走现有审批；description 同步一句话 |
| Server 路由 | `GET /api/projects/:projectId/agents/:id/card-links`、`POST .../card-links`（body `{ path }`）、`DELETE .../card-links/:name`；contracts 加 schema 并走 `parseContract`（server README 机制 1）；name 进 path 前做 basename 校验防 `../` |
| UI | AgentDialog 个性化页新增 `AgentCardLinksField`（未复用 `PathListField`：条目是 `{name,target,dangling}` 三元组且删除键是 name、需悬空态展示，插槽改造成本高于独立组件；交互风格对齐）；列表项显示悬空态；add/remove 经 `ApiClient` 新方法并 reload（create 模式无 agentId，不渲染） |
| i18n | 新增 key 三地齐全（`agent-dialog.cardLinks*` 前缀），build 后验证 `TranslationKey` 自洽 |
| i18n | 新增 key 三地齐全（`agent-dialog.cardLinks*` 前缀），build 后验证 `TranslationKey` 自洽 |

## 非目标

- 项目外目标（`isPathInside` 直接拒绝，后续放宽另议）
- 目录链接（只支持文件链接）
- Windows 无权限时的 copy 回退（会破坏"直接同步"语义；EPERM 只做明确报错 + guide 注明需管理员/开发者模式）
- `worldbook_sources` 配置化（下阶段）

## 测试计划

- core：跟随读取、越界目标拒绝、坏链跳过、增删幂等、fingerprint 经链接感知目标改动
- server：三路由契约 + 越界/非法名 4xx
- tool：`link_card`/`unlink_card` 审批门分类 + 成功/失败路径
- app：AgentDialog 链接增删交互（沿用 PathListField 既有测试模式）

## 文档同步

- `spherse-guide` 世界书一节追加外链用法；`data-conventions.md` 世界书节加链接约束一行；backlog 加 Windows 权限说明条目（如有新发现）。
