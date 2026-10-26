# 对象 A 对照调研：与 Spherse 的重合边界与可借鉴清单

调研时间：2026-10-06
对象：对象 A 的设计文档（25 个设计文档）+ 对照 Spherse 现状
定位前提：**两项目独立并行**，本调研只回答三件事——重合在哪、哪些是重复投入、对象 A 构思期收集的参考里哪些对 Spherse 有启发。不主张合并，不产出 backlog / design 变更。

## 一、结论摘要

1. **重合在能力层，不在产品层。** 对象 A 是垂直应用（长篇叙事创作副驾驶），Spherse 是通用运行时（可组合 Workspace）；两者都本地优先、多 Agent、MCP、Skill、人机协同、上下文预算，但一个解决「写小说」，一个解决「跑任意 Agent 工作区」。
2. Spherse `README.md:35` 已把「持久世界观 / 互动叙事空间」列为目标场景之一——即 对象 A 是 Spherse 架构**本可以托管**的一个 Workspace 实例，而非竞品。
3. 按「独立并行 + 只避免重复投入」定位，Spherse 的吸收原则是：**只取通用机制，不把叙事垂直能力做进内核**（否则与 对象 A 重复投入），并复用 对象 A 已完成的竞品与技术**否决结论**，避免二次调研。
4. 最大缺口：**Spherse 没有评测体系**，对象 A 有完整闭环（5 维 LLM 评分 + 跨模型评委 + seed 锁定 + baseline 回归）。这是唯一值得单独跟进的一条。
5. 其余可借鉴点大多已在 Spherse roadmap 上（Agent 圆桌 / 跨会话记忆 / git 版本控制），对象 A 提供的是**现成设计参考**而非新需求。

## 二、定位对比

| | 对象 A | Spherse |
|---|---|---|
| 一句话 | 本地优先、人机协同的长篇叙事创作副驾驶（`todo_v1.0.md:5`） | 本地运行的个人 Agent 运行时，多 Agent 围绕同一数据空间产出可交互 Workspace（`AGENTS.md:3`） |
| 形态 | Obsidian 插件 + Python 后端（FastAPI + LangGraph） | Electron + React + Fastify 三端（desktop/web/mobile） |
| 宿主 | 寄生 Obsidian Vault（Markdown + YAML frontmatter 为唯一事实源） | 自有项目目录（`.spherse/` + 用户内容 + HTML/UI SDK） |
| 编排哲学 | 固定 Workflow 状态机（LangGraph） | 无固定 workflow：agent + tool + skill + trigger 组合 |
| 对外协议 | MCP **server**（FastMCP，13 工具） | MCP **client**（连接外部 server）+ 自有 HTTP/WS |
| 数据可视化 | Obsidian Canvas 插件（时间线/关系图/地图） | HTML 卡片 + UI SDK（`window.spherse`）+ `.data.json`/`.card.json` |
| 自动化 | 被动（用户触发） | trigger（cron + event）+ TimerService |
| 评测 | 5 维 LLM-as-judge + baseline | 无 |

**层次关系**：对象 A 的 Phase 4「独立插件生态」（时间线、关系网、世界观地图、伏笔追踪、仪表盘）几乎一一对应 Spherse 的「Workspace = 数据 + Agent + Skill + 自动化 + HTML/UI SDK」。若二者要收敛，路径是 对象 A 作为 Spherse 的一个叙事 Workspace，而不是 Spherse 吸收 对象 A 的代码。

## 三、能力重合矩阵

| 能力 | 对象 A 实现 | Spherse 实现 | 判定 |
|---|---|---|---|
| 本地优先/隐私 | Vault 本地存储 | 项目目录本地存储 | 理念一致 |
| 多 Agent 独立配置 | Director + 4 预设子 Agent（`phase3_handbook.md:198-206`） | 任意多 Agent，独立 prompt/工具/主题（`data-conventions.md:74-111`） | 各有实现 |
| MCP | FastMCP server 暴露 13 工具（`phase3_handbook.md:264-281`） | MCP client，每 agent `mcp.json`（`data-conventions.md:113-124`） | 方向相反 |
| Skill | Role/Skill YAML（19 Role） | `SKILL.md` 三层合并（builtin/project/agent） | 各有实现 |
| 记忆检索 | ChromaDB + BM25 混合 + 距离衰减（`todo_v1.0.md:546`） | 关键词子串/tag（`store/memory.ts:30-38`）+ worldbook 关键词注入（`capabilities/card/worldbook.ts:33-57`） | **对象 A 更强** |
| 上下文预算 | 六层 Token 预算 + Context Profile（`phase2_handbook.md:38-49`） | compaction + tool-output-budget（`capabilities.md`） | 各有实现 |
| 人机协同 | Diff-Patch + HITL 逐条 accept/reject（`phase2_handbook.md:131-170`） | `withApproval` 审批卡 + `ask_user` + `rollback_turn`（`security.md:79-91`；ADR-0013） | 各有实现 |
| 工作流编排 | LangGraph 状态机 | agent/trigger 组合 | 哲学不同 |
| 自动化 | 无 | trigger + timer（`capabilities.md:23`） | **Spherse 更强** |
| 长文本评测 | 5 维 LLM-as-judge + 回归（`todo.md:69-80`） | 无 | **对象 A 独有** |
| 多项目隔离 | 多项目 | ProjectRegistry（`architecture/index.md:44-46`） | 两者皆有 |
| Workspace 表达力 | Obsidian Canvas / ItemView | iframe + `window.spherse` 双桥 + DataStore（`ui-sdk.md`） | 目标同，载体不同 |

## 四、重复投入清单（核心）

按「Spherse 内核 / Spherse Workspace·预设 / 留给 对象 A / 双方都不做」四类裁决：

- **Spherse 内核不做的**（与 对象 A 垂直能力重复）：
  - 长篇叙事专用数据模型（FactCard / FlagCard / ChapterCard / TimelineCard 等 14 种 EntityType，`phase1_execution.md:298-312`）——Spherse 已有通用 `.card.json`（worldbook）+ `.data.json`，可用预设 schema 覆盖，不进内核。
  - 叙事专用可视化（时间线 / 关系网 / 世界观地图）——交给 Workspace HTML 卡片，不进内核。
  - 小说 RAG 底座（ChromaDB + BM25 + 距离衰减 + jieba）——Spherse 的记忆演进方向见 `2026-06-07-agent-memory-design.md`（LanceDB + FTS5），不应照搬 对象 A 的 Python 栈。
- **Spherse 可用 Workspace/预设自然覆盖的**：
  - 多 Agent 圆桌、结构化创作卡片、审阅高亮面板、章节仪表盘——皆为「数据 + Agent + Skill + HTML」组合。
- **重复投入但可互补的**：多 Agent 编排、MCP、上下文预算、HITL——两边各造一遍，机制不同且各自够用，**不值得互相移植**，只需在文档层互相引用设计取舍。
- **双方都不该再投的**：对象 A 已明确否决的框架/服务（见第六节），Spherse 直接复用结论。

## 五、参考清单逐条（对象 A 构思期收集）

| 参考 | 对象 A 吸收 | 对 Spherse 的启发 | 建议归宿 |
|---|---|---|---|
| 5 阶段迭代：5 维 LLM 评分 + 跨模型评委 + Pydantic + 随机种子 + baseline（`todo.md:69-80`） | ✅ 完全（核心） | Spherse 无评测体系，Agent/Workspace 质量不可量化 | **Spherse 内核/基建：值得单独立项** |
| 圆桌脑暴（多 Agent 圆桌发言，`todo.md:63-64`） | ✅ BrainstormWorkflow（`phase4_brainstorm_impact_专题.md`） | 已有 backlog「Agent 圆桌」+ landing `upcoming.ts:16` | 直接补设计参考 |
| 多线时间线工具（自定义历法/多周目/泳道矩阵/PDF 导出，`todo.md:16-28`） | ❌ 未吸收 | 正是 Workspace + HTML/UI SDK 的用例 | 预设 Workspace 模板灵感 |
| obsidian-relation-weaver（`todo.md:68`） | ✅ Relation Graph 插件 | `.card.json` relations + HTML 力导向图 | 预设模板 + 卡片 schema |
| NarrativeCanvas 非线性/游戏分支（`todo.md:30-31`） | ⚠️ 仅预留 EntityType，BranchValidate 未实现 | Spherse game-engine 已做分支/存档/回滚（ADR-0013） | 互印证，Spherse 不必重做 |
| WorkBuddy 5 阶段/7 步 + 自动版本备份 + 发布（`todo.md:61-62`） | ⚠️ 仅流程；备份/发布未做 | 对应 backlog「支持文件版本控制（git）」 | 印证 backlog 条目 |
| HaloMate「同 chat 切模型对比」（`todo.md:40-60`） | ❌ 未吸收 | Spherse composer 已有模型切换，对比视图价值有限 | 待评估，低优先 |
| Diff-Patch + HITL 逐条 accept/reject（`todo.md:99-152`） | ✅ 核心 | 补足 Spherse 审批卡：一个「审查建议卡」UI SDK 模式 | UI SDK 卡片模式参考 |
| 距离衰减 `1/log(\|cur-intro\|+2)`（`todo_v1.0.md:546`） | ✅ 核心 | Spherse 记忆仅关键词；叙事场景的时序相关度排序 | **判定：不吸收**（留 Workspace 场景化选项） |
| 六层 Token 预算 + Context Profile（`phase2_handbook.md:38-49`） | ✅ | 与 Spherse compaction / tool-output-budget 对比 | 调查参考，不移植 |
| 「本地 Copilot / MCP / 修改与批注为核心」（`todo.md:90-97`） | ✅ | Spherse 已有 UI SDK、MCP client、审批流 | 已覆盖 |
| 高阶架构建议（Analyzer→Retrieval→Reviewer→Editor，`todo.md:99-152`） | ✅ 名称改写落地 | 与 Spherse 的「能力贡献点」思路可对照 | 调查参考 |
| `pyforge-memory`/`mem0`、`Exgentic`/`agentevals`（`todo.md:82-89`） | ❌ 未采用 | 记忆与评测框架的候选 | 见第六节 |
| LlamaIndex / RAGAS / LangSmith / CrewAI / Phoenix / AutoGen / Letta / DeepEval / Weaviate / Qdrant（`todo_v1.0.md:525-580`） | 🚫 明确否决 | 已评估并给出否决理由 | Spherse 复用结论，不重评 |

## 六、Spherse 不应重复调研（对象 A 已否决）

以下技术 对象 A 均在 `todo_v1.0.md:525-580` 逐条给出否决理由。Spherse 的记忆演进若走到框架选型，应先读该清单再决定是否重开评估：

- 记忆/编排：`pyforge-memory`、`mem0`、Letta (MemGPT)、CrewAI、AutoGen、LlamaIndex。
- 评测：`Exgentic`、`agentevals`、RAGAS、DeepEval、LangSmith、Phoenix。
- 向量库：Weaviate、Qdrant（对象 A 最终选 ChromaDB；Spherse 的 `2026-06-07-agent-memory-design.md` 倾向 LanceDB + SQLite FTS5，属独立选型，不必受 对象 A 影响）。
- 观测/部署：Docker + OpenTelemetry，`mcp-craft`。

区别：这些是**应用层选型**，Spherse 是通用运行时，结论可参考但不能直接套用；价值在于省去「第一轮可行性判断」。

## 七、可借鉴点（按价值排序）

1. **Agent / Workspace 评测 harness（唯一建议单独立项的一项）**：对象 A 的 5 维评分 + 跨模型评委（避免自评偏见）+ 结构化输出 + seed 锁定 + baseline 回归，是一套可直接迁移的通用方法。Spherse 现状为零（`backlog.md` 无评测条目），且评测对通用 Agent 同样必要。落点建议：以 skill + 预设或独立基建的形式，不污染内核。
2. **多 Agent 圆桌的编排设计参考**：对象 A 的 BrainstormWorkflow（participants + rounds + RoundRobin 独立子 Agent 实例，非同一 LLM 切 prompt，`phase4_brainstorm_impact_专题.md`）可直接作为 Spherse backlog「Agent 圆桌」的实现参考。
3. **「审查建议卡」UI SDK 模式**：对象 A「后端绝不直写原文，只发 `UPDATE_PROPOSAL`，前端逐条 accept/reject」（`phase3_handbook.md:257-262`）可作为 Spherse 审批卡（`withApproval`）之外的一种「AI 产出结构化修改建议」卡片范式。
4. **叙事场景的检索排序**（判定：**不吸收为内核机制**）：距离衰减 `1/log(|cur-intro|+2)` 依赖叙事结构元数据（intro 章节距离），与「叙事数据模型不进内核」（§四 / §八）一致；仅保留为叙事类 Workspace 的场景化排序选项（Workspace 可用现有 `created`/tags 近似），不新增 `filterEntries` 排序信号。
5. **结构化创作数据 schema**：对象 A 的 YAML frontmatter 约定（`entity_type`/`introduced_chapter`/`relations`）与 Spherse `.card.json`/`.data.json` 的对应关系，可作为写「叙事 Workspace」预设模板时的 schema 参考。
6. **时间线/关系图/世界观地图**：作为 Workspace HTML 预设模板的选题参考，不进内核。

## 八、明确不建议

- **不照搬 对象 A 技术栈**：Python/FastAPI/LangGraph/ChromaDB 与 Spherse 的 TS/Electron/pi-agent-core 体系不兼容，移植成本高于收益。
- **不把叙事垂直能力做进 Spherse 内核**：会与 对象 A 重复投入，违反 Spherse「最小内核 + 能力贡献点」原则。
- **不为「功能重合」做任何收敛动作**：按用户定位，两项目独立并行；重合部分各自保留，仅在同名功能上互相参考设计取舍。
- **不因 对象 A 有而给 Spherse 加功能**：本节所有借鉴点只有在命中 Spherse 既有 roadmap 或独立需求时才推进。

## 九、范围与不做

- 本调研不修改 `docs/dev/backlog.md`、不新增 backlog 条目。
- 不产出 design/plan，不改任何 `docs/official/` 文档。
- 对象 A 侧文档为只读引用，未做任何修改。

## 十、世界观撰写辅助增强提案（预定版本 v1.1.x）

> 本节为「增强 Spherse 世界观撰写辅助能力」的方案提案，预定随 **v1.1.x** 交付。本节只是提案记录，非 design doc；落地前仍需评审确认。

### 10.1 定位与约束

- 落点：`packages/presets` 预设 / Skill / 模板层，**零内核改动**。
- 面向场景：世界观设定创作（非长篇连载），因此**不引入长篇连载式的强制结构**。
- 复用现有机制：Markdown 长文 + worldbook `.card.json`（关键词触发注入，`capabilities/card/worldbook.ts`）+ HTML/UI SDK + 现有工具集。
- 可视化的零内核实现路径（已核实可行）：
  - 读取：viewer HTML 用 `spherse.api.content.get(path)` 读数据文件（`api.call` 只读白名单，走 server 访问策略，`packages/app/src/ui-sdk/handlers/api.ts:26`）。
  - 动态更新：`spherse.events.on("file:update", { path }, handler)` 重新读取并重渲染。
  - 「一键」触发：由 Agent `render_card` 内联展示，或生成/打开一个 viewer 页面；**不做「文件类型自动打开视图」**（属渲染器改动，v1.1.x 明确不做）。

### 10.2 范围

吸收：

- 世界构建引导流程（对应 对象 A 的 Bootstrap 四步：世界观→角色→大纲→风格，`todo_v2.5.md:122-130`），但**不强制字段**。
- 「先查后写」的轻一致性提示：写新设定前用 `search_card`/`search_content` 检索已有设定，发现冲突时提示；**不做校验引擎**。
- **数据格式 → 可视化**（核心）：约定若干数据文件格式，让一份约定格式的文件可以「一键」渲染成对应可视化，并随 `file:update` 动态更新。首期三个方向：
  - **时间轴**：`*.timeline.json` → 时间轴视图；或提供更省事的「生成可动态更新的时间轴 HTML」路径。
  - **思维导图 / 关系图**：`*.mindmap.json`（或 canvas 风格 JSON）→ 思维导图 / 关系图视图。
  - **世界观地图**：`*.worldmap.json` → 底图（可选） + 相对坐标（0–100）钉点视图，未定位地点进列表。

不吸收：

- **导入向导**（用户确认不需要）。
- 14 种 `EntityType` + `relations` 强 schema（CharacterCard/FactionCard/WorldCard/TimelineCard，`phase1_execution.md:298-475`）。
- FactCard / FlagCard / 章节卡 / 章节工作流 / Diff 审稿 / HITL。
- 六层 Token 预算 / ChromaDB / BM25 / 距离衰减 / 一致性检查引擎。

### 10.3 交付内容（预设层）

| 资产 | 路径 | 说明 |
|---|---|---|
| 预置 Agent `worldview` | `templates/preset-agents/worldview.md` | frontmatter 声明 `name`/`tools`，正文为世界观创作 system prompt；承接原 `worldview-assistant` prompt 的能力并绑定工具 |
| 声明 | `presets.json` `presetAgents` | 增 `{ "dir": "worldview", "slugBase": "worldview" }` |
| builtin skill `spherse-worldbuilding` | `skills/spherse-worldbuilding/SKILL.md` | 轻量工作流：澄清 → 共创 → 沉淀（Markdown / worldbook 卡片）→ 回顾；含设定存放约定与可视化数据格式约定，不强制 schema |
| 可视化 viewer：时间轴 | `skills/spherse-worldbuilding/references/`（或独立内置资产） | 读 `*.timeline.json`，渲染时间轴；HTML + UI SDK，订阅 `file:update` 动态更新 |
| 可视化 viewer：思维导图/关系图 | 同上 | 读 `*.mindmap.json`，渲染可折叠/可拖拽导图；同上 |
| 可视化 viewer：世界观地图 | 同上 | 读 `*.worldmap.json`，可选底图 + 相对坐标钉点，未定位地点进列表；同上 |
| 声明 | `presets.json` `presetSkills` | 增 `{ "dir": "spherse-worldbuilding" }` |
| 原 prompt 模板 | `templates/prompt-templates/worldview-assistant.md` | 保留供快速创建 agent，或标注与预置 Agent 的关系 |

预置 Agent 建议工具集：`read_file / write_file / edit_file / list_files / search_content / read_card / search_card / edit_card / read_data / query_data / render_card / load_skill / ask_user`（不含 `run_command`）。

### 10.4 数据格式 → 可视化映射（提议，非定案）

| 数据格式 | 视图 | 参考 |
|---|---|---|
| `*.timeline.json` | 时间轴（按时间排序，可用泳道/分支） | 对象 A Timeline Weaver（`todo_v2.5.md:454-545`）、OC 多线时间线工具（`todo.md:16-28`） |
| `*.mindmap.json` | 思维导图 / 关系图（力导向或树形） | 对象 A Relation Graph（`todo_v2.5.md:677-910`）、obsidian-relation-weaver（`todo.md:68`）、NarrativeCanvas（`todo.md:30-31`） |
| `*.worldmap.json` | 地图：底图 + 相对坐标（0–100）钉点 | 对象 A World Map（`phase4_world-map_专题.md:7-9`：坐标 0–100、底图可选、未定位分组） |

渲染载体与触发方式见 10.1 / 10.6；格式字段的最终定义待评审（本节仅提议，非定案）。

### 10.5 与 对象 A 能力对照

| 对象 A 能力 | 本提案对应 | 差异 |
|---|---|---|
| Bootstrap 四步向导 | skill 工作流「澄清→共创→沉淀→回顾」 | 不产出结构化卡片，只产出 Markdown/卡片 |
| UnstructuredImporter 设定导入 | ❌ 不吸收 | 用户确认不需要 |
| ImpactAnalysis / Consistency Checker | 「先查后写」提示 | 不做批量扫描与冲突引擎 |
| Timeline Weaver | `*.timeline.json` → 时间轴 viewer | 不引 Obsidian Canvas，走 HTML + UI SDK |
| Relation Graph | `*.mindmap.json` → 导图 viewer | 同上 |
| World Map | `*.worldmap.json` → 地图 viewer | 保留「底图可选 + 相对坐标 0–100」，不引 Leaflet |
| Chapter Dashboard / Plot Tracker | ❌ 不吸收 | 世界观场景不需要 |
| 14 种 EntityType / Fact·Flag 卡 | ❌ 不吸收 | 属长篇连载设施 |
| ChromaDB+BM25+距离衰减 | ❌ 不吸收 | 属记忆基建，另议 |

### 10.6 已定 / 未决

已定（依用户倾向）：

- 落地层：**纯预设、零内核改动**；不做「文件类型自动打开视图」。
- 可视化范围：时间轴 + 思维导图/关系图 + 世界观地图，共三个 viewer。
- 「一键」触发：Agent `render_card` 内联展示，或打开生成的 viewer 页面。
- viewer 打包：**独立的通用 builtin skill**（不并入 `spherse-worldbuilding`，因为可视化不限于世界观场景）。

未决（待评审确认）：

- 格式与扩展名定名：`*.timeline.json` / `*.mindmap.json` / `*.worldmap.json` 是否采用，字段 schema 如何定义。
- 渲染载体：独立 HTML 页面 vs `HtmlCard` 嵌入聊天流（或两者皆可）。
- 首期范围：三个 viewer 全做，还是先做时间轴。
- 是否需要示例项目承载验证（现有 `spherse-example-harry-potter` 可作载体）。
- v1.1.x 版本号与排期确认。

## 十一、SDK 开放工作区文件写能力可行性（拟定 v1.1.x）

> 问题：是否开放 SDK，让注入的 HTML 能读 / 写 / 创建 / 删除工作区内文件。经代码核实后给出可行性判定；非 design doc。

### 11.1 现状（代码事实）

- **读已有**：`api.call` 只读白名单 9 项（`content.get/listDir/stat`、`fileTree`、`agents.*`、`sessions.*`），走 server 访问策略（`.spherse/` 被拒）（`packages/app/src/ui-sdk/handlers/api.ts:20-30`）。
- **写受限**：`ui-sdk.md:61` 设计约束「**无写 / 管理端点**——变更一律走专用 action」。页面现有写通道仅两条，且都受控：
  - `data.*`：限定 `.data.json` 且不含 `.spherse/` 段；`$` 前缀键拒绝；`data.mutate` 走 `$manifest` schema（`handlers/data.ts:6-11,23-25,92-115`）。
  - `card.*`：限定 `.card.json` 条目级读写（`handlers/card.ts:6-12,119-210`）。
- **可复用的写链路**：`server/routes/content.ts:98-166` → `ProjectManager` 写门面（`resolveProjectPath` + `assertWrite` + `FileWriteMutex`；`project-manager.ts:342-430`）。
- **沙箱**：所有 HtmlCard iframe 同一 `sandbox="allow-scripts allow-same-origin"`（`features/chat/HtmlCard.tsx:199`）。**注**：inline HTML fence 传 `injectSdk={false}`（无 `window.spherse`）；有 SDK 的 LLM 产出面是 **`render_card` tool 卡片**与服务端 preview 的 HTML（`AssistantBubble.tsx:180-189`、`server/routes/preview.ts:135-150`）。
- **归因/回滚**：仅 `data`/`card` 可 `rollback_turn`；`write`/`edit` 走归因但 `skipped`（`capabilities/rollback/tools.ts:91-119`）。**SDK 直写 data 无 `toolCallId`，故不可回滚**（ADR-0013:15；backlog 已记）。

### 11.2 通用 fs 写的必需项

1. SDK runtime 加命名空间 + host handler（`packages/app/src/ui-sdk/handlers/fs.ts` + barrel）。
2. 复用 `ProjectManager`/server content 路由；**需在 `FileWriteMutex` 内**（已内建）。
3. **策略必须收窄**：现 `serverAccessPolicy` 可写 `AGENTS.md`、`CHANGELOG.md`、`.spherse/theme.css`、`.spherse/skills/**`、`.spherse/attachments/**`（`access/access-policy.ts:59-67`）——**远超「内容文件」**，等于开放 agent 配置/持久的写面。
4. **排除 `.data.json` / `.card.json` / `.spherse/**`**（否则绕过 `$manifest`/card 语义）。
5. **归因/回滚**：需版本链才能被 `rollback_turn`（当前显式不做，属独立前置项）。
6. 尺寸/数量上限；删除不可逆（无回收站）。

### 11.3 安全风险

- LLM 产出的 `render_card` 卡片已带 SDK → 通用写 = 让模型生成的页面可写/删策略允许的一切。
- 策略面过大（含 agent 配置）→ 提权/supply-chain 风险；`$manifest` 可被绕过；`deletePath` 递归不可逆；无归因即静默变更。

### 11.4 选项与成本

- **A（推荐短期）维持不开**：扩展 `$manifest` / card 受控写覆盖更多场景。成本 **S–M**，保 `ui-sdk.md:61` 约束与回滚语义。
- **B 开放受限 fs 写**：新 **专用窄策略**（仅用户内容文件，非 `serverAccessPolicy`）+ 排除 data/card/.spherse + 上限 + 显式 opt-in（对齐 `yolo`）+ 版本链。成本 **L**。
- **C 只写/建、不删（不 move）**：同 B 去掉破坏性操作。成本 **M–L**；去掉最严重的不可逆。

### 11.5 结论（v1.1.x）

- **不直接开通用写**：阻塞点是设计而非工量——策略面过大、`.data.json`/`.card.json` 语义被绕过、无归因/回滚（与 ADR-0013、`data-conventions.md:246` 相悖）。
- 短期走 **A**；若确需工作区写，走 **C**（写/建、无删）+ 专用窄策略 + `FileWriteMutex` + 上限 + opt-in + 文件版本链。
- **前置项**：先补「SDK 直写的回滚发现路径」（backlog）与沙箱/注入面的显式评审；落地前单独出 design，明确与 `ui-sdk.md:61` 的取舍。
