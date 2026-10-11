# 对象 B（外语学习机）对照调研：与 Spherse 的重合边界与可借鉴清单

调研时间：2026-10-06
对象：对象 B 的源码（v2.2.0.100）+ 对照 Spherse 现状
定位前提：**两项目独立并行**。本调研只回答三件事——重合在哪、哪些值得吸收、哪些是重复投入。不主张合并，不产出 backlog / design 变更。
范围限定：聚焦 对象 B「外语学习机」相关子系统的功能吸收；其陪伴 / 故事 / TRPG / 公司模拟 / 宠物等非语言学习子系统只在定位对比中涉及。
相关调研：本目录 `03-language-immersion-game.md`（对象 C——语言沉浸游戏的「用」侧参考实现，与本作「学」侧互补）。

## 一、结论摘要

1. **Spherse 无语言学习域，属 greenfield。** 全仓库无 vocab / wordbook / flashcard / SRS / FSRS / Anki / pronunciation / STT / 用户向翻译等能力；`translate` 仅指 i18n 本地化，`card` 指世界书 `.card.json`，`vocabulary` 指事件/会话词汇表。因此本调研不是「去重」，而是「吸收哪些、落在哪一层、避免与 对象 B 重复投入」。
2. **重合在能力层，且多为「各有实现」。** 两边都有：本地优先、AI 角色对话、世界书、记忆、TTS、交互卡片、自动化。真正的语言学习能力（SRS、词汇行为建模、多语言词法、渗透阅读）是 **对象 B 独有**。
3. **吸收原则：语言学习是垂直能力，按「最小内核 + 能力贡献点」不进内核**，落点是 **Workspace / 预设**——用现有 `.data.json`+DataStore、`.card.json`+CardStore、HTML Card+UI SDK、trigger、skill 拼装。与 对象 A 调研结论一致（只取通用机制，不把垂直能力做进内核，否则与 对象 B 重复投入）。
4. **可复用 对象 B 已完成的竞品调研。** 对象 B `docs/LANGUAGE_LEARNING_ROADMAP.md` 已基于 GitHub 高星项目做过一轮 16 条提案的采纳/否决评审，Spherse 无需二次调研（见第十节）。
5. **最值得吸收的是 FSRS 间隔重复 + 「到期优先」选词**（`services/srsScheduler.ts`，ts-fsrs 封装）。它是通用机制、Spherse 现状为零；其次为词汇行为三维模型、多语言词汇正则注册表、词汇渗透阅读游戏、信息卡「独立 AI 调用」机制（第八节）。
6. **可行性裁决：核心学习闭环可用一个 Workspace 1:1 复刻**；真缺口只有「语音输入/STT」与「原生聊天内逐词沉浸」两处，其余为工作量（见第六节）。
7. **用户提取的 4 个功能点已评估**（第七节，拟定 v1.2.x）：气泡翻译（机器翻译 / 翻译 LLM）、引号内词句样式、`/card:{prompt}` 独立调用、独立识图模型。其中 7.2 落在 chat 渲染器，7.1/7.3 落在 chat 前端 + 旁路调用，7.1/7.4 需专用 provider 角色；共同底层「辅助式调用旁路 + 专用 provider 角色」建议单列评估。**7.6** 把对象 C的翻译老师 / 情景提示 / 文化注释归为**信息卡运用方向**，并补「信息卡外部调取 / 卡内回写」设计。

## 二、定位对比

| | 对象 B（外语学习机） | Spherse |
|---|---|---|
| 一句话 | AI 陪伴 + 多语言学习 RPG：聊天陪伴、单词本、故事、TRPG、公司模拟、桌面宠物（`README.md:1`） | 本地运行的个人 Agent 运行时，多 Agent 围绕同一数据空间产出可交互 Workspace（`AGENTS.md:3`） |
| 形态 | 单页 React 19 + Vite（单文件产物），无路由库、无全局状态库 | Electron + React + Fastify 三端（desktop/web/mobile）+ core 运行时 |
| 存储 | 自研 IndexedDB 封装（`services/indexedDB.ts`，自研库） | 项目目录（`.spherse/` + `*.data.json` + `*.card.json` + SQLite session） |
| 语言学习定位 | **垂直应用**（应用内建词本/SRS/题型/游戏化） | **通用运行时**（可托管任意 Workspace，本身不含垂直能力） |
| 交互载体 | React 视图（`views/*`，非沙箱） | HTML Card iframe + `window.spherse` 双桥 + DataStore |
| 对外协议 | 无 MCP | MCP client + 自有 HTTP/WS |
| 自动化 | 应用内定时（签到/主动消息） | trigger（cron + event）+ TimerService |
| 数据可视化 | React 统计视图（`views/WordBehaviorStatsView*`） | HTML 卡片 + UI SDK |
| 评测 | 无 | 无 |

**层次关系**：对象 B 整体几乎就是 Spherse 架构**本可托管**的一个 Workspace（角色陪伴 + 世界书信息卡 + 故事/TRPG + 语言学习数据 + 游戏化），只是它自带 React 视图而非 HTML 卡片。若两者收敛，路径是「对象 B 的语言学习能力做成 Spherse 的一个 Workspace 预设」，而非 Spherse 吸收 对象 B 代码。

## 三、Spherse 现状：语言学习空白 + 可复用原语

**空白（greenfield）**：Spherse 无词本、无复习排程、无题型、无发音评测、无用户向翻译、无内置词表/词频。TTS 仅聊天朗读（浏览器 Web Speech API，`packages/app/src/features/chat/tts/`），**无 STT / 麦克风 / 录音**。无 `web_search` / `fetch_url` 内置工具（外部能力靠 MCP）。

**可直接复用的原语**（吸收落点的地基）：

| 原语 | 位置 | 语言学习用途 |
|---|---|---|
| `*.data.json` + DataStore + `$manifest` | `docs/official/data-conventions.md`（活网页数据文件节） | 词本、每词 SRS 状态、行为计数；`$manifest` 声明 queries/mutations，前端与 agent 共同读写 |
| `*.card.json` + CardStore（世界书） | `packages/core/src/capabilities/card/` | 词典/词条/设定；关键词命中注入主上下文（**注意预算 ≤8 条 / 2000 token**，大词库不宜走此路） |
| HTML Card + UI SDK | `docs/official/architecture/ui-sdk.md` | 闪卡 / 选择 / 听写 / 渗透阅读界面；`window.spherse.data.*` 持久化，可在卡片内跑前端 JS（含 ts-fsrs） |
| `render_card` | `packages/core/src/capabilities/render/` | agent 产出练习/统计卡片 |
| skill（三层合并） | `docs/official/data-conventions.md`（skill 节） | 语言学习工作流（词本约定、题型、每日复习流程） |
| trigger（cron/event） | `packages/core/src/capabilities/trigger/` | 「每日待复习」提醒、SRS 到期事件 |
| memory | `packages/core/src/capabilities/memory/` | 学习者偏好等粗粒度笔记（关键词子串检索、近 20 条自动注入，**不承载排程**） |
| MCP | `packages/core/src/capabilities/mcp/` | 接词典/翻译/发音/网络等外部能力 |

**命名提醒**：Spherse 中 `card`=世界书、`translate`=i18n。语言学习 Workspace 需用独立命名（如 `vocab`、`review`、`lexicon`），避免与既有词汇冲突。

## 四、能力重合矩阵

| 能力 | 对象 B（外语学习机） | Spherse | 判定 |
|---|---|---|---|
| 本地优先 / 隐私 | IndexedDB 本地 | 项目目录本地 | 理念一致 |
| AI 角色对话 | 有（角色/气泡/主动消息/心情） | 有（agent/session/theme） | 各有实现，非本次重点 |
| 世界书 | 信息卡系统：关键词/正则触发 → **独立 AI 调用** → HTML 卡片（`services/infoCard*.ts`） | `.card.json` worldbook：关键词命中 → **注入主上下文**，无独立调用 | 机制不同，可互补 |
| 记忆 | `memoryContext` 按角色 | `memory_save/recall`（关键词子串 + 近 20 条注入） | 都弱，各有实现 |
| TTS | 逐语种音色/语速（`services/tts.ts`） | 浏览器 Web Speech 朗读 | 都有，**均无 STT / 发音评测** |
| 交互卡片 | React 视图 | HTML Card + UI SDK（iframe 沙箱） | 载体不同 |
| 结构化数据 | 自研 IndexedDB store | `.data.json` + DataStore + `$manifest` | Spherse 更通用 |
| 自动化 | 应用内定时（签到/主动消息） | trigger（cron + event）+ TimerService | Spherse 更通用 |
| 提示词/Skill | 内置提示词模板 + 模块化 prompt | `SKILL.md` 三层合并 | 各有实现 |
| **间隔重复（FSRS/SRS）** | ✅ ts-fsrs 封装（`services/srsScheduler.ts`） | ❌ | **对象 B 独有** |
| **词汇行为建模（三维评分/分区）** | ✅（`WORD_LEARNING_SYSTEM_DESIGN.md`） | ❌ | **对象 B 独有** |
| **多语言词汇正则注册表（24 语言）** | ✅（`modules/vocab/languageRegistry.ts`） | ❌ | **对象 B 独有** |
| **词汇渗透阅读游戏** | ✅（`views/MixedReadingGameView/`） | ❌ | **对象 B 独有** |
| **AI 查词（原型/IPA/语法/变形）** | ✅（`services/wordQuery.ts`） | ❌ | **对象 B 独有**（可用现成 LLM 工具复刻） |
| **逐词交互 / 生词率 / 难度评级** | ⚠️ 仅划词气泡，逐词着色评审不做 | ❌ | 对象 B 仅部分 |
| **跟读 / 发音评分** | ❌ 评审不做（成本高） | ❌ | 双方都不做 |
| **双语对照 / 字幕 / 词频表** | ❌ / ⏸ 暂缓 | ❌ | 复用 对象 B 结论 |
| **Anki 互通** | ⏸ 暂缓 | ❌ | 复用 对象 B 结论 |

## 五、吸收裁决：按落点分层

### 5.1 内核不收（垂直能力不进 runtime）

- SRS 调度算法、词汇行为模型、多语言词法正则、题型、游戏化（星尘/等级/签到）——皆属垂直领域，进内核会违反「最小内核 + 能力贡献点」，且与 对象 B 重复投入。
- 与 对象 A 调研同理：Spherse 内核只提供数据/卡片/UI/触发/技能/记忆等通用机制，语言学习在其上组合。

### 5.2 预设 / Workspace（吸收落点）

用现有原语拼装「语言学习 Workspace 预设」，不新增内核：

| 维度 | 落点 | 说明 |
|---|---|---|
| 词本 + SRS 状态 | `.data.json`（`$manifest` queries/mutations） | 每词存 `{word, pronunciation, meaning, pos, fsrs, counters, tags}`；queries 支持「到期/分区/语言」筛选 |
| 复习排程 | HTML Card 内前端 JS（ts-fsrs）+ 回写 data.json | 卡片可跑 npm 包逻辑；`data.set/mutate` 落盘，`ifVersion` 乐观锁防并发 |
| 题型界面 | HTML Card（闪卡/选择/听写/挖空/配对） | 复用 `spherse-write-html` / `spherse-use-ui-sdk` 既有 skill |
| 每日提醒 | trigger（cron） | 「今日待复习 N 词」事件驱动一条 turn/通知 |
| 查词 | 现成 fs/search 工具 + prompt | 或接 MCP 词典；`原文出处 -> 原型` 双层结构用于变形词高亮 |
| 工作流 | 预置 agent + project skill | 「澄清目标语言 → 导入/建词本 → 每日复习 → 统计回顾」 |
| 统计 | HTML Card（进度/分区/遗忘曲线） | 借鉴 对象 B `WordBehaviorStatsView` 的信息架构 |

### 5.3 是否需要新 capability：暂不需要

- FSRS 计算可放 HTML Card 前端；持久化用 DataStore；不需要内核算力。
- 对象 B 的「信息卡关键词触发 → 独立 AI 调用」若要在 Spherse 复刻，首选 **trigger + 独立子会话** 组合（不占用主对话上下文），而非新 capability。**仅当该模式出现第二个真实消费方时**，再评估抽象为「事件驱动专家调用」贡献点（与 backlog「run-state 下沉 core」「Capability 接口拆分」同类，属条件触发）。

## 六、可行性裁决：Workspace 能否 1:1 复刻 对象 B 学习机

**判断**：核心学习闭环（词本 → AI 出卡/查词 → 题型训练 → FSRS 排程 → 统计 → 每日提醒）能用一个 Workspace **1:1 复刻**；「语音互动」与「聊天内逐词沉浸」是两处真实平台缺口；其余为工作量问题。

### 6.1 可直接复刻（原语已覆盖，无需内核改动）

| 能力 | 落点 |
|---|---|
| 词本 + SRS 状态 | `.data.json` + `$manifest` |
| 训练题型（闪卡/选择/听写/挖空/配对） | HTML Card |
| FSRS 排程 | 卡内跑 ts-fsrs、`data.mutate` 回写；agent 侧 `query_data` 取到期 |
| AI 查词 / 翻译 / 出题 | agent 回合或 MCP |
| 每日待复习提醒 | cron trigger |
| 统计 / 遗忘曲线 / 分区 | HTML Card |
| 跨页持久状态 | `.data.json`（较 对象 B 的 IndexedDB 更适合 agent 共写） |
| 多语言词法正则 | 移植注册表为卡资产 / skill 参考 |

### 6.2 缺口与工作项（按严重度）

| # | 能力 | 类型 | 影响的现状 |
|---|---|---|---|
| 1 | 语音输入 / 录音 / STT | **真缺口** | 运行时无 STT、无麦克风链路；卡内仅能用浏览器标准 API，Electron（Chromium）下 `SpeechRecognition` 基本不可用，仅 web/PWA 走 Chrome 时可能可用。听写/跟读类要打折（TTS 反向可行：卡内 `speechSynthesis`） |
| 2 | 原生聊天内逐词高亮 / 划词弹卡 | **真缺口** | chat 渲染器不支持可插拔词元高亮，而这正是 对象 B「在对话里沉浸学词」的核心体验。只能退到 HTML 卡（可用 `spherse-embed-chat` 嵌聊天），无法改主聊天气泡 |
| 3 | 游戏化经济 / 等级 / 签到 / 宠物 | 需自建 | 内核无经济/等级系统，全在 data + 卡内实现 |
| 4 | 阅读器（章节 / 进度 / 书签） | 需自建 | content browser 为通用只读预览，无阅读态 |
| 5 | 信息卡「关键词触发 → 独立 AI 调用 → 渲染卡」 | 需自建 | worldbook 只注入主上下文、无独立调用；用 trigger + 子会话近似（见 5.3） |

### 6.3 架构性差异（不是能力缺失，但决定「像不像」）

- **没有内置应用壳**：对象 B 是原生 React 多视图 + 全局 App 状态（约 59 个 `useState`）+ 常驻导航；Spherse Workspace 是若干独立 HTML 页 + postMessage，无应用壳/路由/常驻进程，需在 HTML 侧自建。
- **运行时上下文注入面有限**：只有 chat HtmlCard 的 iframe 注入 `{sessionId, agentId, projectId}`；欢迎页与内容浏览器预览不注入会话上下文，依赖会话的动作（`sendMessage` 等）要注意入口选择。
- **状态非常驻**：卡片刷新即无内存态，须落 `.data.json` 后重读，与 React 常驻状态的心智不同。

## 七、吸收候选：用户提取的四个功能点（拟定 v1.2.x）

> 本节为吸收提案记录，**拟定排期 v1.2.x**；非 design doc，落地前仍需评审确认。

**总评**：7.2 落在 chat 渲染器；7.1、7.3 落在 chat 前端 + 旁路调用；7.1、7.4 需专用 provider 角色（翻译 / 识图）。**都不是新内核 capability，但都要扩展现有 chat 前端 / provider 层**。共同底层见 7.5。

### 7.1 对话气泡翻译（机器翻译 / 翻译 LLM）

- **对象 B**：消息操作里的「翻译气泡」（`services/translation.ts`，走 AI 调用）。
- **定性**：用**机器翻译服务（DeepL / Google 等）或专用翻译 LLM**，**与会话模型解耦**——不是把「翻译这句」丢给当前聊天 agent。
- **Spherse 现状**：无翻译功能，`translate` 仅指 i18n 本地化；provider catalog 只有文本 / 图片（生成）角色，**无翻译角色**。
- **落点**：chat 消息级动作（`UserBubble`/`AssistantBubble` 操作区；`SelectionMenu` 同层先例）→ 调用翻译 provider → 译文渲染在气泡下方，**不落会话历史**。
- **两条实现路径**：
  - a. **专用翻译 LLM**：走 catalog 的辅助调用（复用 7.5 旁路），指定一个翻译模型；
  - b. **机器翻译 API**（DeepL / Google）：非 LLM 服务，需新增 provider 角色 / 服务端路由 / MCP 接入。
- **缺口**：翻译 provider 角色（同 7.4 的 vision 角色思路）+ 辅助式调用旁路（见 7.5）。

### 7.2 chat 渲染器：引号内词句可定制字体样式

- **对象 B**：逐词高亮——`modules/vocab/languageRegistry.ts` 的 `renderContent` 输出 `WordToken[]`，按目标语言着色/定制字体。
- **Spherse 现状**：`MarkdownContent` 用 react-markdown + remark 插件管线（已有自定义插件 `remark-plain-structure.ts` 先例），**但无词元级扩展**；主题只能改 CSS，无法结构化「引号内文本」。
- **落点**：新增一个 remark/rehype 插件，把各类引号（`「」` `""` `''` `『』` 等）内的文本包成 `<span class="..." data-...>`，样式走现有主题 CSS 变量 / `data-chat-*` 钩子。**可实现，但属平台级新机制**（即第六节判定的「原生聊天逐词沉浸」真缺口）。
- **注意**：通用版（任意引号统一/分类样式）比 vocab 版简单；若与语言学习联动，语言判定 + 词本匹配可放 Workspace 资产，但**渲染入口仍需前端提供**。

### 7.3 信息卡 `/card:{prompt}`：独立调用 + 独立 API + 渲染到当前窗口，不入历史

- **Spherse 现状（已具备大部分）**：
  - `/command:{name}` 斜杠命令**已存在**（`.spherse/commands/{name}.md`，`spherse-create-command` skill）。
  - frontmatter **`model: provider/model-id` 已支持为命令切换模型**（即「独立 API」雏形）。
  - `$1` / `$ARGUMENTS` / `@文件` 展开已支持。
- **差异（待补）**：
  1. 命令展开后「作为用户消息发给当前 agent」→ **进入会话历史**；需增加「ephemeral / 不落历史」模式。
  2. 结果作为普通 assistant 气泡；需走卡片渲染（`render_card` / 新卡类型 / 浮窗）落到「当前窗口」。
  3. `model:` 是「切换会话模型」，需升级为「一次性独立调用（可用任意 provider，不影响会话模型）」。
- **定位**：扩展 command 机制（契约 + 前端 + 可能 core 路由），非新内核 capability。**核心难点：不进入 Session Event Log**——现有 LLM 调用都经 AgentRunner → log，需引入旁路调用路径。

### 7.4 独立多模态模型仅用于识图

- **对象 B**：`imageRecognitionConfig.ts` + `imageRecognitionService.ts`，独立的识图 provider。
- **Spherse 现状**：图片走 attachments 注入**主多模态模型**上下文（catalog 模型声明 `input: ["text","image"]`）；`generate_image` 另有图片生成 provider。**无独立的「识图 / vision」provider 角色**。
- **落点**：settings / provider 层增加 vision 角色（或指定「识图模型」），识图请求走该模型而非主模型。属配置层 + 一条调用路径的扩展。

### 7.5 共同底层：辅助式调用旁路 + 专用 provider 角色（建议单列评估）

- **旁路调用**（点 1、3）：一次**不写入会话历史、结果只渲染 UI** 的调用。Spherse 目前所有 LLM 调用都经 AgentRunner → Session Event Log，没有这种旁路。
- **专用 provider 角色**（点 1、4）：翻译、识图需独立于会话模型的服务角色；现 catalog 只有文本 / 图片（生成）两类。
- 这是 4 点里唯一有「平台机制」分量的部分，建议单独立项评估（1/2/3/4 均可复用）。与 backlog「条件触发」的 run-state / 生命周期类条目同属基建。

### 7.6 信息卡运用方向（v1.2.x）：翻译老师 / 情景提示 / 文化注释 + 外部调取

> 由对象 C的三个辅助工具（翻译老师 / 情景提示 / 文化注释）反推而来，落到 §7.3 的信息卡机制上。

**运用方向**：这三个工具本质是「**独立 AI 调用 + 结果渲染到当前窗口、不入主对话历史**」，与 `/card:{prompt}` 同一形态，只是 prompt 模板固定、可按用途预置。

| 工具 | 输入 | 独立调用产出 | 渲染 |
|---|---|---|---|
| 翻译老师 | 玩家母语文本 + 目标语言 | 目标语言说法 + 讲解 | 卡 |
| 情景提示 | 当前场景 + 在场 NPC | 一句模糊提示 | 卡 |
| 文化注释 | 话题 / 选中文本 | 文化背景说明 | 卡 |

**设计补充：信息卡可被外部调取 / 回写**

- **双向闭环**：§7.3 的 `/card:{prompt}` 是「调用 → 渲染」；本条补「渲染 → 回写」与「外部调用」，二者合起来才是信息卡的完整形态。
- **外部调取**：信息卡不只能由 `/card:` 触发，还应能被其他卡 / 按钮 / 事件 / 工具调用（经 UI SDK action、trigger 或数据文件）。
- **卡内回写**：卡内可放置交互（如「收藏」按钮），点击后把卡内容（词条 / 句子 / 注释）写入指定 `.data.json`（生词表 / 全局词汇本）或 `.card.json` 词条。
- **落点**：卡内用 `window.spherse.data.mutate` / `card.entry.add` 回写（SDK 现成），配合 `$manifest` 定义写入契约；卡自身用 `data.*` / `file:update` 读回状态——**无需新内核机制**。

## 八、可借鉴清单（按价值排序）

1. **FSRS 间隔重复 + 「到期优先」选词**（`services/srsScheduler.ts`，`hooks/useWordSelection.ts`）。
   - 对象 B 用 ts-fsrs@5.4.1（MIT，无原生依赖），参数 `request_retention=0.9 / enable_short_term=false / enable_fuzz=false`；`WordBehaviorData` 加可选 `fsrs` 字段，`recordReview` 时推进排程（答错=Again，答对=Good），选词 Step 0「到期词按 due 升序占 ⌈count×60%⌉ 保底」，老数据惰性初始化。
   - 对 Spherse：可直接作为语言学习 Workspace 的排程层；ts-fsrs 可在 HTML Card 内运行。**这是唯一值得单点跟进的通用机制。**
2. **词汇行为三维模型 + 四区分区**（`WORD_LEARNING_SYSTEM_DESIGN.md`）。
   - 被动识记 `0.1+0.9·(n/(4+n))`、主动识记 `(正确率×0.9+赌场净值×0.1)·e^(−天数/半衰期)`、掌握应用线性累计；按阈值分 `potential/consolidation/breakthrough/mastered`。
   - 对 Spherse：直接转成 `.data.json` 字段 + HTML 统计卡片的信息架构（数据 schema 可参考）。
3. **多语言词汇正则注册表（24 语种）**（`modules/vocab/languageRegistry.ts` + `docs/ADD_NEW_LANGUAGE_GUIDE.md`）。
   - 按脚本族（CJK/LATIN/CYRILLIC/MIXED/KOREAN/JAPANESE/THAI/ARABIC）工厂化 `wordRegex/splitPattern/parserPattern/matchStrategy`，覆盖变音符号、撇号、粤拼数字声调、短语（1–3 词）。
   - 对 Spherse：作为任何 multilingual Workspace 的可复用参考资产（HTML 卡片脚本或 skill reference），避免重复踩字符集/边界坑。
4. **词汇渗透阅读游戏**（`views/MixedReadingGameView/readingGameUtils.ts`）。
   - 从已读内容抽页，把词本词的**中文释义词元**就地替换为外语原词高亮，点词弹卡、作答推进 FSRS；词本优先零 token，AI 补充按「源+页+语言」缓存。
   - 对 Spherse：一个高完成度的 Workspace 模板选题（HTML + data + FSRS + 划词）。
5. **信息卡「关键词/正则触发 → 独立 AI 调用 → HTML 卡」**（`services/infoCard*.ts`）。
   - 与 Spherse worldbook 的本质差异：对象 B 命中关键词后**独立调用一次 AI** 生成卡片内容并渲染，不污染主对话；Spherse worldbook 只把条目注入主上下文。
   - 对 Spherse：作为「事件驱动专家卡片」的机制参考，落点 trigger + 子会话（见 5.3）。
6. **AI 查词（原型/IPA/词性/语法/变形 + `原文出处 -> 原型` 双层格式）**（`services/wordQuery.ts`、`VOCABULARY_REGEX_DESIGN.md` §六）。
   - 解决变形词（went→go）无法高亮的问题：前端优先按 `->` 左侧原文匹配，右侧解析原型/音标/释义，`{}` 提语法与变形说明。
   - 对 Spherse：prompt 模式 + 卡片 schema 可借鉴；实现用现成 LLM 工具。
7. **书籍/字幕导入 → 阅读型 Workspace**（`services/bookImporter.ts`、`views/BookReader.tsx`）。
   - txt/html 编码检测导入、章节/进度/收藏、划词气泡（带前后文）；`.srt` 解析（提案 7，暂缓）。
   - 对 Spherse：content browser 已通用，阅读型 Workspace 可作为 HTML 预设选题。
8. **游戏化正反馈联动复习**（签到/星尘/等级）。
   - 「科学复习 + 游戏化」是 对象 B 自评的差异化组合；Spherse 无经济/等级系统，若要复刻应作为 Workspace 内 HTML+data 实现，不进内核。

## 九、Spherse 不应重复投入

- **不重造语言学习引擎**：SRS、三维评分、多语言词法、题型、游戏化——对象 B 已做透并沉淀文档；Spherse 内核不做，Workspace 层按需组合即可。
- **不重复记忆系统调研**：对象 B 记忆是「长期记忆条目 + 最近对话」直接拼 system 块（`services/memoryContext.ts`），与 Spherse `memory_save/recall` 同属简单注入式，互无可移植优势；语言学习 Workspace 用 DataStore 承载结构化状态即可，不进记忆基建（演进方向见 对象 A 调研：`LanceDB + FTS5`）。
- **不重复 TTS/发音调研**：对象 B 明确否决跟读/发音评分（支持语种多、音素级评估成本高，`LANGUAGE_LEARNING_ROADMAP.md` 提案 3/15）；Spherse 现状更弱，可直接复用其结论。
- **不重复外部生态调研**：高星仓库全景（Anki/FSRS/LibreLingo/Lute/read-frog/immersive-translate/Echo-Loop/BabelDuck/SillyTavern 等）已由 对象 B 汇总，直接引用。

## 十、可复用 对象 B 的调研结论（`LANGUAGE_LEARNING_ROADMAP.md` 16 提案）

对象 B 已逐条给出采纳/否决结论，Spherse 直接复用、不重开评估：

- **采纳/已实施**：FSRS 间隔重复（1）；Cloze 挖空（4，已有「书信游戏」）；词汇渗透阅读（14）；词汇渗透·跑团记录源（16）。
- **明确否决（附理由）**：句子挖掘闭环（2，与现有划词/收藏重叠）；跟读与发音评分（3，语种多、音素级成本过高）；双语对照阅读（5，token 成本高、用户多有现成双语）；逐词交互阅读 Lute 化（6，复杂度高、衔接难）；语音通话实时化（15，复杂度）。
- **暂缓（不具备条件）**：字幕沉浸（7）；内置词表与真实词频（8）；Anki 互通（9）；写作批改与纠错周报（10）；AI 情景口语通话（11）；学习法教练与投入时长看板（12）；可分享的沉浸剧本/角色卡（13）。

**注意口径差异**：对象 B 的否决多基于「垂直应用 + 多语种成本」视角，Spherse 是通用运行时，结论可参考但不能直接套用（如词频表/Anki 互通对某些 Workspace 仍可能有价值）。价值在于省去「第一轮可行性判断」。

## 十一、明确不建议

- **不照搬 对象 B 技术栈**：React 19 单页 + 自研 IndexedDB + React 统计视图，与 Spherse 的 core 运行时 + HTML Card + UI SDK 体系不兼容，移植成本高于收益。
- **不把语言学习垂直能力做进 Spherse 内核**：会与 对象 B 重复投入，违反最小内核原则。
- **不为「功能重合」做收敛动作**：两项目独立并行；对象 B 整体可作为 Spherse 的一个 Workspace 实例，而非合并。
- **不因 对象 B 有而给 Spherse 加功能**：本调研所有借鉴点只有在命中 Spherse 既有需求或明确立项时才推进。

## 十二、范围与不做

- 本调研不修改 `docs/dev/backlog.md`、不新增 backlog 条目。
- 不产出 design/plan，不改任何 `docs/official/` 文档。
- 对象 B 侧文档与源码为只读引用，未做任何修改。
