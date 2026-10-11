# 酒馆式提示词组装 vs Agent：讨论整理与 Spherse 对照

调研时间：2026-10-10
来源：一段外部讨论（匿名整理，隐去来源）；未逐条核实其引用的第三方资料。
对照：Spherse 现状 + 本目录 `05-prompt-assembly.md`（Spherse 一次 prompt 的拼接）+ `docs/dev/investigation/2026-09-17-game-engine/`（酒馆式前端调研）+ `docs/dev/investigation/worldbook-order-tuning.md`。
定位：把该讨论的结论与建议整理成可评估条目，并对照 Spherse 判定「可吸收 / 已有 / 不建议」。

## 一、结论摘要

1. **核心命题**：某酒馆式前端（下称「酒馆」）的提示词组装是**静态上下文拼接**（用户驱动、单次推理、无状态）；Agent 是**动态自主循环**（目标驱动、多步 ReAct、工具 + 记忆）。二者应融合——酒馆给 Agent「灵魂 / 记忆 / 舞台」，Agent 给酒馆「行动力 / 工具」。
2. **对 Spherse 装配的两条直接建议**（讨论后半段针对 Spherse 实际 `sendMessage → convertToLlm` 流水线）：
   - `<worldbook>` 目前作为**队尾 user 消息**注入，有「近因偏见」风险（模型可能把它当用户刚说的话）→ 建议改 **system 身份 / 插到历史之前**。
   - 「预设与顺序控制」应**下沉为配置 + 显式路由**，**不要**做拖拽排序 UI，也**不要**做智能 Scene Router。
3. **与 09-17 调研高度收敛**：两边都指向「**世界书即 Router**」「不往主 renderer 注 JS / 不强上自动路由」；本报告新增 **system-block tags 开关** 与 **worldbook 位置风险**（后者 Spherse 已在 `worldbook-order-tuning.md` 待验项 #4 挂起）。
4. **两条 v1.0.x 提案**：(a) **worldbook 注入位置修正**——把 `<worldbook>` 从「队尾 user（当前用户消息之后）」挪到「当前用户消息之前」，真实输入仍居末位（近因）、世界书作前导语境，成本最低；(b) **扩大 worldbook 注入**——取消当前 `WORLDBOOK_MAX_ENTRIES=8` / `WORLDBOOK_MAX_TOKENS=2000` 的注入预算上限。
5. **拼接顺序建议**（§五）：稳定前缀在前、易变块在后（护 provider prompt cache）；世界书置于当前用户消息之前；格式 / 安全约束可放近尾。
6. **不建议**：LLM 智能 Scene Router、用户手动拖拽排序 UI、照搬酒馆，以及「**世界书挂载 tools**」（数据→能力升级、工具集逐轮漂移；见 §七）。

## 二、讨论要点整理

### 2.1 四概念区别（AI 文游 / 酒馆卡 / 跑团 / 剧本杀）

| 维度 | 跑团 TRPG | 剧本杀 | AI 文游 | 酒馆卡 |
|---|---|---|---|---|
| 核心驱动 | 真人 GM 主持、共同创作 | 预设剧本、推理还原 | AI 实时生成 | AI + 角色卡 / 世界书 |
| 规则自由度 | 高（规则书 + GM 裁定） | 低（流程结局固定） | 中到高 | 高（世界书 / 变量可精控） |
| 叙事方向 | 向前推进 | 向后回溯 | 实时生成 | 由设定引导 |
| 载体 | 人 / 规则书 / 骰子 | 实体剧本 / 线索卡 | 一段提示词 / 网页 | 软件 + 角色卡（PNG） |
| 社交 | 强（面对面） | 强 | 弱（单人） | 弱（单人 / 群聊模拟） |
| 重玩性 | 高 | 低 | 中到高 | 中到高 |

### 2.2 「卡能否包含其他三项」

结论：**能「模拟 / 承载」单人文字体验层，不能从本体上「包含」**。跑团 / 剧本杀的核心还有真人 GM 临场裁定、真人玩家间的欺骗结盟、线下搜证与实体道具、骰子仪式感——这些 AI 可模仿不可替代。另：「AI 文游」是上位概念，酒馆卡是其一种实现，反向不成立。

### 2.3 附带的「模组创作工具」截图提取（作为 Workspace 设计参考）

讨论从中提取了一款 TRPG 模组创作工具（未命名）的设计风格与功能点：

- **设计风格**：暗黑档案 / 克苏鲁调查风；深黑-暗绿-暗棕底 + 高饱和红强调（危险 / 真相 / 守秘人信息）；衬线字体模拟旧打字机 / 机密档案 / 报纸剪报；三栏 + 卡片式 + 故事板（时间线看板）。
- **功能点**：① AI 辅助生成（STEP 化向导、**一键生成草稿**、**叙事分支**多选、自动填写）；② 结构化叙事（可编辑定稿、真相 / 高潮 / 多结局、时间轴故事板）；③ TRPG 机制（技能 / 属性检定 D100、角色卡属性+背景、**守秘人笔记**仅 GM 可见、理智 / 创伤）；④ 场景呈现（交互地图节点、报纸排版结局）；⑤ 素材库（场景清单 checklist、物品分类库「自动入库」、NPC 对话 / 动作 / 隐藏线索）。

> 这张「模组工具」几乎是**一个 AI 辅助创作 Workspace** 的现成需求清单，可与 09-17 的 `requirements.md` 对照。

### 2.4 酒馆组装 vs Agent

| 维度 | 酒馆组装 | Agent |
|---|---|---|
| 驱动 | 用户驱动 | 目标驱动 |
| 机制 | 单次推理 | 多步循环（ReAct） |
| 工具 | 无原生 FC（靠插件 / 正则伪工具） | 核心能力 |
| 记忆 | 上下文窗口 + 世界书 | 长期记忆库（向量，按需检索） |
| 本质 | 被动、无状态的上下文工程 | 主动、有状态、面向目标的执行框架 |

酒馆「不是 Agent」的三个天花板：无真正 FC（骰子 / 变量靠正则本地截取）、无自主循环、线性上下文。

### 2.5 Agent 吸收酒馆的五个维度

1. **记忆**：滑动窗口 → 世界书式 RAG（关键词触发按需检索）。
2. **人设**：系统提示词 → 角色卡 + 正则强控（推理可冷静、**最终输出经人设过滤**）。
3. **状态**：纯文本 → 变量驱动状态机（用 FC 调 `update_affection` / `roll_dice`，再读状态决定走向）。
4. **多角色**：单 Agent → 群聊式多智能体（各带角色卡 / 世界书，可结盟欺骗对抗）。
5. **体验**：任务导向 → 情感陪伴导向（**主动创造事件**：后台时钟 + 突发事件生成器）。

终极形态「TRPG Agent」：GM Agent（守秘人，持全部真相）+ NPC Agents（多智能体）+ 玩家 + 状态引擎；**酒馆的「提示词组装」变为 Agent 的感知 / 记忆层，Agent 的「循环 + 工具」变为执行 / 推演层**。

### 2.6 预设与顺序控制：四层 + 规范顺序

- 讨论主张：Agent 需要「预设」但不是酒馆式静态拖拽，而是**动态、分层、代码驱动的组装引擎**，预设拆进四层——**核心层**（角色卡 / 底线，固定 system 顶）、**工具层**（FC schema，框架自动注入）、**状态层**（世界书 / 变量，运行时检索拼入）、**上下文层**（RAG 记忆 / 近史）。
- 推荐的底层规范顺序：`核心人设 → 工具定义 → 动态状态 → RAG / 世界书 → 近期历史 → 输出格式约束 → 当前用户输入`（利用首因 + 近因效应）。
- 进阶提法：**Scene Presets**（日常 / 战斗 / 搜证）由「Router Agent」自动切换——**后被自行否定**（见 2.7）。

### 2.7 针对 Spherse 实际装配的点评与四个零成本方案

讨论者看到 Spherse 的 `sendMessage → convertToLlm` 后：

- **亮点**：`worldbookProjector` 克制（≤10 条 / 4000 字符扫描、≤8 条 / 2k token）；**wire-only 与 History 分离**「比酒馆把所有东西揉进一个上下文窗口高级」；`toolOutputBudget`、`compaction-digest`（user 消息）、`turnHooks.beforeTurn` 的 MCP 合并。
- **隐患**：① worldbook 队尾 user 注入的近因偏见；② 预设与代码硬耦合（切场景要 `applyReload` 重载整个 Agent）；③ 附件剥离导致回看失忆。
- **建议**：`Preset Manifest`（YAML/JSON 参数化 system 块与 tools）+ `Context Router`；worldbook 改 system / 前置。
- **用户反对「Scene Router 太难」后，讨论者收回，给出四个几乎零成本方案**：
  - **A. 显式切换**：复用 `/skill:` `/command:`，加 `/preset:combat`（只切状态，不发 LLM）。
  - **B. system block 开关**：Block 注册表 + `activeTags` 过滤，不做整 Agent 切换。
  - **C. 世界书即 Router + 工具挂载**：把场景规则写进世界书条目，条目带 `tools: [...]`，投影时顺带挂 tools——**最优雅、几乎不改结构**。
  - **D. 粗粒度关键词**：几十个关键词 + `Set<string>` 推断 activeTags，5 轮未命中即移除，手动 `/tag:` 覆盖；**明确不要用 LLM 做意图分类**。

## 三、与 09-17 调研的对照

| 议题 | 09-17 调研结论 | 本讨论 | 关系 |
|---|---|---|---|
| 世界书核心机制 | WI 条目 + 关键词触发是核心 | 世界书即 Router + 挂工具 | **收敛且更具体** |
| 自动路由 | 未主张；脚本层第二步 | 明确反对智能 Router，推显式 / 粗粒度 | 收敛 |
| worldbook 位置 | 「位置语义」挂为待真机验证项（order-tuning #4） | 队尾 user 有近因偏见，建议 system / 前置 | **本讨论给出现成假设与替代** |
| 脚本 / 管道 | 脚本管道 + 快捷回复钩子是第二步 | 预设 → 配置化 + 显式切换（非拖拽） | 互补 |
| 定制路线 | 不往主 renderer 注 JS；A/B 分档 | 同（预设下沉配置层） | 一致 |
| 许可 | AGPL，只学思路 | 同 | 一致 |

## 四、对 Spherse 的可吸收条目（按价值）

> worldbook 相关两条**拟定 v1.0.x**：**位置修正**（独立条目）与**扩大注入**（取消 ≤8 条 / 2000 token 预算）；非 design doc，落地前需评审。

1. **worldbook 注入位置修正**（v1.0.x，独立条目）：现为 `[...messages, worldbook]`（`capabilities/card/worldbook.ts:340-349`），而 messages 已含本轮 user 消息 → worldbook 成了「最新消息」。改为在末条 user 之前插入（详见 §五），role 仍 `user`、仍 wire-only，仅改插入点。
2. **扩大 worldbook 注入（取消预算）**（v1.0.x）：现 `WORLDBOOK_MAX_ENTRIES=8` / `WORLDBOOK_MAX_TOKENS=2000`（`capabilities/card/worldbook.ts:15-16`）限制每轮注入的条目数与 token 数。按需放开或改为可配（先评估 token 占比与指令遵循，参考 `docs/dev/investigation/worldbook-order-tuning.md` 待验项）。
3. **显式预设切换**：复用 `expandSlashMessage`（`session/agent-runner.ts:212-220`）加 `/preset:` / `/tag:`，前端做成按钮；切换只改状态块与 tools。**不做**意图识别。
4. **system-block tags 开关**：Block 注册表 + `agent.state.activeTags`，组装时过滤（`always` 恒在 + tag 命中）。可与 profile 的固定块并存。
5. **粗粒度关键词 tags**（方案 D）：在 `turnHooks.beforeTurn` 里跑关键词→tag，5 轮未命中移除，手动覆盖。零 LLM、零误判灾难。
6. **wire-only 概念扩展**：预设块 / 场景规则也可标注只进 wire、不入历史（复用现有 wire-only 语义）。
7. **模组创作工具作为 Workspace 设计参考**：AI 辅助分步创作 + 结构化（场景 / 事件 / 线索 / NPC / 物品）+ 可视化（时间线 / 地图 / 报纸）+ TRPG 机制（检定 / 理智 / 守秘人信息）。与 09-17 `requirements.md` 对照取交集。
8. **情感陪伴 / 主动事件**（讨论维度 5）：后台时钟 + 突发事件生成器——与某陪伴类产品的「主动消息 2.0」、09-17 的 trigger 事件钩子呼应。

## 五、对 Spherse 拼接顺序的建议

酒馆的规范顺序（讨论整理）：`核心人设 → 工具定义 → 动态状态 → RAG/世界书 → 近期历史 → 输出格式约束 → 当前用户输入`。套到 Spherse（`system 串 + tools + 投影后 messages`）前，有两条 Spherse 特有约束必须先满足：

- **provider prompt cache**：compaction 生成摘要时「精确复刻请求前缀」以命中缓存（`architecture/core.md`）——所以**稳定块必须在前、易变块在后**，不能把每轮都变的 worldbook / 记忆插进前缀，否则缓存失效。
- **convertToLlm 角色过滤**：只保留 `user / assistant / toolResult`（`session/agent-assembly.ts:252-254`）——**system 消息会被丢弃**，所以「世界书改 system 身份」要先改这条过滤（成本高、provider 行为不一）。

据此建议（**不改角色、只调位置**）：

```text
[System]  ← 稳定 → 易变
  1 project-instructions     稳定
  2 agent-profile            稳定（核心人设）
  3 session-context          每会话稳定
  4 preloaded-context        稳定
  5 skill-catalog            基本稳定
  6 time-perception          静态
  7 mcp-context              半稳定（能力）
  8 memory                   易变（增长）→ 放 system 末尾
[Tools]
[History]
  ...（含 compaction-digest 等）
  <worldbook 命中>           ← 从「当前用户消息之后」挪到「之前」
  [当前用户消息]             ← 必须始终居末（近因）
[可选 尾部 reminder]         格式 / 安全等硬约束（近因；Spherse 已有 MCP 尾部 reminder 先例）
```

要点：

1. **worldbook 位置（v1.0.x）**：现为 `[...messages, worldbook]`，messages 已含本轮 user → worldbook 成最新。改为 `[...messages.slice(0, -1), worldbook, lastMessage]`，让真实输入居末、世界书作前导语境。role 仍 `user`、仍 wire-only，改动面最小。
2. **稳定前缀**：PI/AP/SC/PC/skill 保持在前（现状已满足）；memory（增长）已在 system 末尾，符合「易变靠后」。
3. **格式 / 安全约束近尾**：酒馆把格式约束放末尾；Spherse 现主要靠 `agent-profile` / skill（在头部）。若需强化遵循，可用尾部 reminder（MCP 已用此手法）。
4. **领域「状态 / 变量」**：现状 Spherse 无状态注入面（`.data.json` 不进 prompt，无 data projector）。**结论：不作为领域「状态引擎」进内核，但提出通用机制方案**——「状态数据外链」：软链项目 `.data.json` 到 agent 目录，文件内用保留键 `$state` 声明注入子树，projector 每次 LLM 调用把它渲染成 `<state>` 插到当前用户消息之前（写侧沿用 `data` / `mutate_data`，零新增写工具）。落地设计见 `docs/dev/features/2026-10-11-state-data-link/design.md`。世界书挂 tools（数据→能力）仍否决（§七）。

## 六、对 Spherse 的缺口 / 风险（本讨论新增角度）

- **worldbook 位置**：队尾 user 注入存在近因偏见（已被 Spherse 自己挂为待验项，非新问题，但本讨论给了明确假设）。
- **无运行时按场景切块 / 切 tools 的机制**：预设硬编码在 profile，切换靠 `applyReload` 重建整个 Agent（`agent-runner.ts:561-593`）。
- **projector 不能改 tools**：`contextProjectors` 只产 messages（改 tools 需新贡献点）——这也是「世界书挂 tools」成本偏高、已被列入 §七 不建议的原因之一。
- **无 system-block tags / 显式预设**：只有固定 profile 块 + slash 的 skill/command 展开。

## 七、明确不建议

- **不做智能 Scene Router**（LLM 意图分类：延迟高、成本高、不稳定，误判断崖）。
- **不做用户手动拖拽排序 UI**（Agent 的排序应是隐式、代码驱动）。
- **不照搬酒馆**：其组装为静态单次、无 FC、线性上下文；只取其「人设 / 记忆 / 背景注入」思路。
- **不往主 renderer 注 JS**（与 09-17 一致）。
- **世界书条目挂载 tools（`tools: [...]`）**：讨论曾提议，经复核**不采纳为高价值项**——① 世界书条目（尤其第三方导入的角色卡）是**内容 / 数据**，命中即挂工具等于「数据触发能力升级」，破坏「profile 声明工具、静态可审计」的模型，是注入 / 提权面；② 关键词命中使工具集**逐轮漂移**，与 approval gate、前端 `tool-registry` 的静态假设冲突，模型也更难规划；③ 收益可由**显式预设**或 agent 自主调用替代；④ 改造成本不低（projector 需能改 tools）。列为**待评估（默认不做）**。

## 八、范围与不做

- 本调研不修改 `docs/dev/backlog.md`、不新增 backlog 条目。
- 不产出 design/plan，不改任何 `docs/official/` 文档。
- 讨论来源为只读引用；其引用的第三方资料未逐条核实。
