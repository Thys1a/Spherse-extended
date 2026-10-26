# 对象 C 对照调研：构建在 Agent 运行时上的语言沉浸游戏参考实现

调研时间：2026-10-06
对象：对象 C 的源码（半成品，M1–M6 部分完成）
定位前提：**独立项目**。它本身不是竞品，而是一个「跑在 agent 运行时（opencode）上的语言沉浸游戏」参考实现——恰好落在 Spherse「Workspace」的目标形态上。本调研回答：它与 Spherse 的关系、哪些设计值得吸收、哪些不复用。
关联：本目录 `02-language-learning-app.md`（对象 B 负责「学」，本作负责「用」，二者互补）。

## 一、结论摘要

1. **它是同一问题的另一种解法。** Spherse 用「agent + HTML 卡 + DataStore/工具」承载 Workspace；对象 C用「重型自建前端（Vue）+ 文件服务器 + state 文件 + AI 只产纯 JSON」。两者都把 agent 当推理内核，但**边界划分哲学不同**——这正是本调研最大价值所在。
2. **最值得吸收的是纪律，不是代码**：`代码/AI 边界`（确定性逻辑全在代码、生成性内容才给 AI；AI 不写盘、不掷骰、不判成败，`statusDelta` 只是建议由代码钳制）、统一 JSON 协议 + 分阶段 zod、事件「代码定骨架/AI 填血肉」、同游 `systemLine` 与主叙事分离、语言工具三层分流、turn-journal 崩溃恢复、自调整规则 + 权限分级。
3. **与 Spherse 现有能力高度可映射**：state 文件 ≈ `.data.json`，mechanics/skills ≈ Spherse skill，Vue 视图 ≈ HTML 卡，instruction ≈ agent profile，file-server ≈ DataStore/CardStore 持久化。一个 Spherse Workspace 原则上能承接它。
4. **反向暴露 Spherse 的一处设计取舍**：Spherse 现状让 agent 直接调用 `mutate_data`/`edit_card`/`write_file` 写状态；对象 C**刻意禁止 AI 写状态**、把随机与成败锁在代码里。做游戏/仿真类 Workspace 时，Spherse 需要一套「AI 只产出意图、代码裁决落盘」的约定（宜落 skill/模板，非改内核）。
5. **与 对象 B 互补**：对象 B 偏「学」（词本/SRS/题型/复习），对象 C偏「用」（在剧情里用目标语言沟通，同游负责翻译/讲解/点评）。它同时印证了 对象 B 调研 v1.2.x 的「辅助式调用 + 专用翻译 backend」方向——翻译老师/情景提示/文化注释都是**独立于主对话的短调用**。
6. **单 Workspace 可行性**：能复现玩法与内容，但属「重建」而非直接搬入；两条架构约束需变通，且比原版少三块旁路能力（翻译/异步调用/语音）。详见第八节。
7. **衍生平台能力候选**（第九节）：「AI 输出解析 → chat 渲染 / trigger」记为 **v1.1.x**；「输出 → 跑脚本（非 agent）」记为 **v1.3.x 预备案**。辅助式调用缺口记为 **v1.2.x**（信息卡运用方向，设计见 对象 B 调研 §7.6）。

## 二、它是什么

- **概念**：异国小镇冒险（跑团）× 同游陪伴 × 真实语言沉浸。玩家流落异国小镇，所有人都只讲本地目标语言，只有「同游系统」听得懂母语；玩家必须用目标语言生活与冒险。
- **形态**：三进程——`opencode serve :4096`（AI 后端，session + prompt）、Node `file-server :4097`（状态/存档读写，路径白名单）、`Vite :5173`（前端入口，开发期代理二者）。
- **前端**：Vue3 + Vite + Pinia + zod；四宫格（TopBar / LeftPanel / MainStage / CompanionPanel）+ ToolboxBar。
- **AI 后端**：`opencode.json` 声明 `default_agent: game-engine`、`instructions: [Instruction.md]`、`skills.paths`、server CORS。玩家自备 LLM key。
- **状态**：`state/*.json`（player/npcs/locations/quests/current-run/last-output/events/current-event/turn-journal/codex）、`memory/events.md`（追加）、`saves/{slot}/`（复制 state+memory）、`user/vocab/{lang}.json`（跨存档全局词汇本）、`data/`（只读资料池）。
- **半成品程度**（README「限制说明」+ 策划）：词典 API 未接（LLM 降级）；TTS 未接；子代理 narrator/logic 未启用；RelationNet 未做；策划里的语音输入/音标/默听/角色语音多为待办。

## 三、与 Spherse 的关系

| | 对象 C | Spherse |
|---|---|---|
| 角色 | 一个**具体的语言沉浸游戏**（垂直应用） | **通用 agent 运行时**，承载任意 Workspace |
| 运行时 | opencode（session/skills/instruction/agent） | 自研 core（session/capability/skill/trigger/mcp） |
| UI 载体 | 自建 Vue 组件（叙事区/面板/工具箱） | HTML Card iframe + UI SDK（`window.spherse`） |
| 状态持久化 | state JSON + file-server | `.data.json`（DataStore+`$manifest`）+ `.card.json` + SQLite session |
| 确定性逻辑 | `roundEngine.ts` 纯函数（骰子/roll/阈值/时间/任务机） | 无内置游戏逻辑位；可放 HTML 卡内 JS 或 `run_command` |
| 内容生成 | AI 产出纯 JSON（zod 校验） | agent 调工具 / 产出文本 / `render_card` |
| 规则 | `Instruction.md` + `skills/mechanics/*` | agent profile + 三层 skill |
| 自动化 | 前端回合循环 + 阈值异步调用 | trigger（cron/event）+ TimerService |
| 存档 | 5 槽 + autosave + turn-journal | `rollback_turn` + 数据文件版本（无多槽快照） |
| 语言工具 | 三层分流（见 §四） | 无（v1.2.x 才规划翻译 provider） |

**判断**：对象 C是 Spherse「Workspace」目标形态的**姊妹实现**，且用 opencode（与 Spherse 同源的运行时）跑通；它证明「agent 运行时 + 垂直前端」可行，但它选择了**自建前端**而非 Spherse 的 HTML 卡路线。

## 四、架构要点（摘要）

**设计红线：代码混合驱动——确定性走代码，生成性走 AI。**
- 全在 `roundEngine.ts`（纯函数、可注入 RNG 单测）：时段循环（早/午/晚，1 时段=3 回合）、事件 roll（日常:突发=8:2）、阈值检测、数值钳制、任务状态机、判定 roll（难度概率表 70/25/5 等）。
- AI **永不**掌控随机数/成败；`statusDelta` 是「建议」，代码按范围钳制（hp 0~100、affinity −100~100）后落盘。
- **持久化只有一条路径**：前端 `fileApi → file-server`；AI 不写文件。

**统一 JSON 协议**：每次调用 system 带「输出纯 JSON」标记；按回合阶段拆独立 schema + `parseXxx`（`dialogue/judgment/eventGenerate/eventExpand/ending/beginNarrative`），zod 校验，失败降级原文 + 重试。事件预告从 AI 输出 schema 移到持久化契约（`state-files.ts`）复用。

**回合主循环**：`submitTurn(kind,input)` → 前端先 roll 是否要同游 `systemLine` → 组装最小字段 prompt（不含 mechanics 全文）→ `sendMessage` 得 JSON → zod → `applyAiResponse`（数值/NPC/任务/事件追加/地点变化）→ `advanceRound`（时段/事件请求/阈值/自动存档）→ 串行消费 `pendingRequests` 生成事件预告。

**同游系统**：人格 6 选 1（本局固定）；发言走独立字段 `systemLine`，与 GM 主叙事分离；每回合固定概率（默认 20%）命中，**并入同一回合 AI 调用**（不单独发请求）；情景提示/翻译老师由前端 `llmTools` 独立调用（不占主 session）。

**语言工具四层分流**：① NPC 整句翻译随叙事顺带产出（`npcLines[].translation`）；② 查词/句翻/情景/文化注释走机翻 API 或 LLM（固定 prompt、无 session、高频短调用）；③ 词典（释义/音标/词形/例句）走专用词典 API 或本地词库（本期 LLM 降级）；④ TTS/ASR 走浏览器 Web Speech。

**语言设计红线**：语言是媒介不是机制——无语言等级/经验/资源限制/惩罚；语言不通造成的信息差是戏剧素材；一个存档绑定一门语言。`translationMode`（full/click/guess）控制译文显隐。

**健壮性**：session 绑定写入 `user/runtime-config.json` + Web Locks 互斥（防多标签各建 session）；翻译工具用**独立 tool session**，不污染游戏上下文；`turn-journal.json` 支持回合崩溃恢复 + memory 幂等标记 `[turn:{id}]`；存档/读档在 busy 期禁用。

**自调整**：玩家可编辑 Instruction / skills（热重载，下一次调用生效）；`player.override` 六字段 + 权限分级（标准/高级/最高）覆盖默认行为与机制，但不得破坏技术契约（JSON schema、读写边界、代码掌控的随机）。

## 五、可吸收清单（按价值，落点均建议 skill/模板层，不改 Spherse 内核）

1. **`代码/AI 边界`纪律**（最高价值）：确定性逻辑（随机/判定/结算/状态机）归代码；AI 只做叙事合理化；AI 的数值变化是「建议」由代码钳制；持久化单一路径、AI 不写盘。→ 沉淀为 Spherse 做**游戏/仿真类 Workspace** 的 skill 规范（对应 backlog 里的 game-engine 探索）。
2. **统一 JSON envelope + 分阶段 schema + zod + 失败降级**：AI 输出永远是结构化契约，前端按用途显式 parse。→ 可作为「agent 与前端协作型 Workspace」的输出协议模板。
3. **事件系统「代码定骨架、AI 填血肉」+ pendingRequests 队列 + 幂等 ID**：代码 roll 类型/写队列，AI 只填标题/简介；稳定 ID 去重、崩溃可重放。→ 与 Spherse trigger/事件机制互补的设计参考。
4. **同游 `systemLine` 与主叙事分离**：把一个「陪伴/助手角色」的输出与主角叙事解耦，且概率触发并入同一调用。→ 针对「多 Agent / 圆桌」与「助手角色」的编排参考（与 backlog「Agent 圆桌」相关）。
5. **语言工具三层分流**：整句翻译随叙事（0 额外调用）/ 高频查词句翻走无 session 短调用 / 词典专用 backend。→ **直接印证 对象 B 调研 v1.2.x 的 7.1、7.5**（辅助式调用 + 专用翻译 provider），并给出「按频率与语义分层路由」的落地范式。
6. **`translationMode`(full/click/guess)**：语言沉浸的关键 UX——同一份译文数据按模式显隐，不重复生成。
7. **turn-journal 崩溃恢复 + memory 幂等标记**：回合提交「先写快照/日志、成功后清空」，重放不重复；与 Spherse 的 `rollback_turn`/Session Event Log 可对照（Spherse 已有自己的事件溯源）。
8. **自调整规则 + 权限分级（标准/高级/最高）**：玩家可覆盖规则但有边界，不得破坏技术契约。→ 可作为 Spherse Workspace「用户可调规则」的权限模型参考。
9. **全局词汇本跨存档共享**（`user/vocab/{lang}.json`）+ 一键收藏：语言学习类 Workspace 的数据建模参考（对应 对象 B 的全局词本设计）。

## 六、对 对象 B 调研 / v1.2.x 的补充

- **学 vs 用闭环**：对象 B = 系统化「学」（词本、SRS、题型、复习、词汇渗透）；对象 C = 情境化「用」（在剧情里被迫用目标语言沟通，同游翻译/讲解/点评）。两者拼起来才是完整语言学习 Workspace。
- **对 v1.2.x 提案的印证**：对象 C的「翻译老师 / 情景提示 / 文化注释 / 划词翻译」全部是**独立于主对话、可配独立后端（机翻 API 或 LLM）的高频短调用**，正是 对象 B 调研 §7.1（气泡翻译=机器翻译/翻译 LLM）与 §7.5（辅助式调用旁路 + 专用 provider 角色）的现实用例。
- **AI 协同方式对照**：对象 B/对象 C都在应用层做「AI 产出结构化内容、代码裁决」，与 Spherse「agent 直接调工具改数据」是不同信任模型，值得在 Workspace 规范里并存两种模式。

## 七、明确不建议 / 不复用

- **不把 opencode/Vue/file-server 技术栈或其 state-JSON 体系搬进 Spherse**：Spherse 已有 DataStore/CardStore/HTML 卡；照搬等于造重复基建。
- **不把游戏引擎做进 Spherse 内核**：事件 roll、判定、回合机、经济等属垂直逻辑，落 Workspace/模板层。
- **不复用其「破限 / 内容边界」章节**：那是该游戏的业务设定，与 Spherse 运行时无关。
- **不为其半成品缺口背书**：词典 API、TTS、子代理、RelationNet 均是它自己未完成项，不代表 Spherse 需补齐。

## 八、可行性裁决：单 Workspace 能否复现对象 C

**判断**：能复现其玩法与内容，但本质是「**重建**」而非「直接搬入」——用 HTML 卡当游戏前端、`.data.json` 存状态、agent 当 GM/同游即可；两条核心架构约束只能变通或需补积木。

### 8.1 能直接用现成原语复现

| 对象 C | Spherse 落点 |
|---|---|
| `state/*.json`（player/npcs/locations/quests/events/current-event） | `.data.json`（DataStore + `$manifest`） |
| `Instruction.md` + `skills/mechanics/*` | agent profile + 三层 skill |
| GM + 同游分工 | GM agent + 同游 agent（或单 agent 结构化字段） |
| Vue 四宫格/工具箱/角色面板 | 单个 HTML 卡（卡内 JS 即前端代码） |
| NPC 台词 + 译文、`eventsAppend` 记忆 | agent 产出结构化内容 → data.json / memory |
| 自调整规则 + 权限分级、compact | project skill 编辑 + agent profile、会话压缩入口 |

### 8.2 能但不等价的变通

- **确定性引擎（`roundEngine`）**：放 HTML 卡内 JS（骰子/roll/阈值本是前端活），状态经 `data.mutate` 回写；但 Spherse 无「代码侧引擎」的官方位置，需 Workspace 约定承载。
- **卡 ↔ agent 结构化往返**：SDK 无「调 agent 并拿回 JSON」原语（`sendMessage` 是触发，`events` 只暴露 `file:update`）。变通链路：卡算完 → 发 prompt → agent 把 JSON 写进 `.data.json` → 卡收 `file:update` → 读取渲染（或 `api.call` 轮询 session 消息）——**异步间接**，非同步返回。
- **多槽存档 + turn-journal**：无内置；用 `copy_file`/命令自建快照 + data 版本回滚。

### 8.3 真缺口

1. **辅助式 / 无上下文调用 + 独立 backend**：阈值异步、事件补生成、翻译老师等「不占主对话、可独立 backend」的调用，正是 对象 B 调研 §7.5 的同一缺口。→ **记为 v1.2.x**，作为**信息卡运用方向**（翻译老师 / 情景提示 / 文化注释）落地，设计见 对象 B 调研 §7.6。
2. **STT/ASR 与语音工具层**：运行时不提供（与 对象 B 调研同一结论），卡内 Web Speech 尽力而为，Electron 下 ASR 基本不可用。
3. **词典 / 机翻专用 provider**：无。

### 8.4 一句话

玩法体验能接近复现；但「代码掌控随机与判定、AI 只产 JSON 不写盘」这条纪律，只能靠 **Workspace 约定 + 数据桥**维持，且比原版少三块旁路能力（翻译/异步/语音）。**可行，但属于重建。**

## 九、衍生平台能力候选：AI 输出解析 → 渲染 / 触发 / 脚本

> 由「能否从 AI 回复提取 JSON/正则 → render / trigger / script」的讨论衍生；本节记录候选与**拟定排期**，非 design doc。

| 候选 | 说明 | 现状与落点 | 排期 |
|---|---|---|---|
| **AI 输出 → chat 渲染** | 解析输出中的 JSON 块 / 正则命中 / 分段标记 → 卡片 / UI / 多气泡 | 已有 fence 解析先例（`html-fence-parser`、引用围栏、`render_card`）；扩展为通用输出标记解析器（前端渲染层）：结构化块 → 卡片、多气泡分段标记 → 气泡切分，共用同一 tokenizer；分段需求见 `11-chat-bubbles-stickers.md` §五，以本节为唯一出处 | **v1.1.0** |
| **AI 输出 → trigger** | 扫描 assistant 输出 → 发 trigger 事件 | 已有 `emit_trigger_event`（原生）；补「输出后扫描」钩子（session 输出中间件） | **v1.1.x** |
| **trigger → 跑脚本（非 agent）** | trigger 动作为「执行脚本」，不烧 agent turn；确定性自动化 | 无；需 trigger 新 action 类型 + 脚本运行时 + 沙箱 / 白名单 / 审批 | **v1.3.x 预备案** |

**原则**（讨论结论）：

- 结构化**副作用**优先走原生工具调用（`render_card` / `emit_trigger_event` / `mutate_data`）；**不用文本正则驱动副作用**——那是把 tool call 降级为文本协议，重蹈 backlog「长上下文工具调用写成明文标记」的脆弱性。
- 分段标记是**展示提示**，不是副作用协议：只改变渲染（一切多泡），不写盘、不触发动作、不参与审批；模型不输出标记时退化为单气泡。标记必须在读取边界（复制 / TTS / 搜索摘要 / 导出）剥离，与 `stripHtmlFences` 同级；裸换行不得作为分泡依据（会切碎代码块 / 表格 / 列表），只认显式标记 + 围栏保护。
- 消费方是 HTML 卡 / 外部 UI 时，走**数据文件桥**（agent 写 `.data.json`，卡 `data.*` / `file:update` 读），而非解析聊天文本。
- 「输出 → 脚本」单独评估：把 LLM 输出当执行向量，安全面大（allowlist + 沙箱 + opt-in + 防注入），故列 **v1.3.x 预备案**。

## 十、范围与不做

- 本调研不修改 `docs/dev/backlog.md`、不新增 backlog 条目。
- 不产出 design/plan，不改任何 `docs/official/` 文档。
- 对象 C 侧文档与源码为只读引用，未做任何修改（含同仓库既有 Spherse 卡片/数据游戏资料，未纳入本次结论）。
