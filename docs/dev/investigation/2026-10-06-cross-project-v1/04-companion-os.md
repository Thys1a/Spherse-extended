# 对象 D 对照调研：浏览器里的 AI 陪伴「虚拟手机 OS」

调研时间：2026-10-10
对象：对象 D 的源码（React + TS + Vite，local-first，约 28 个桌面 App；**源码可见许可，非开源，仅可学习概念**）
定位前提：**独立项目**。它是一个「装在浏览器里的虚拟手机系统」式的 AI 陪伴/角色扮演产品——与 Spherse「Workspace」目标重合，但形态是垂直整机（手机 OS + 应用群 + 云后台生成 + 推送）。
关联：本目录 `01-narrative-creation-tool.md` / `02-language-learning-app.md` / `03-language-immersion-game.md`。对象 D 是「陪伴 + 记忆 + 主动」的纵深参考，与对象 B（学）/对象 C（用）互补。

## 一、结论摘要

1. **不能零改动复刻。** 对象 D 是高度完整的垂直整机（约 28 个 App、后台云生成 + Web Push、多形态人设资源）；Spherse 是通用运行时。可作为 Workspace 复现其中一部分，但有几处**真缺口**（见第六节）。
2. **最值得吸收的是「记忆」与「主动」两套系统**：向量化**记忆库**（七脑区 + 衰减 + 巩固 + 混合检索 + 扩散激活 + 房间门牌 + 认知消化）是所见最完整的长期记忆设计；**主动消息 2.0**（用户自部署 Worker 后台生成 + 推送 + 副作用「云端只识别、客户端执行」）是所见最强的离设备自动化。
3. **多处机制与 Spherse 同构但更细**：统一上下文装配（`buildCharacterRequest`）、世界书 position/order/**depth/role** 注入、用户自配 MCP、上下文可见范围/水位线——Spherse 有对应能力，但世界书注入与 MCP 容错更粗。
4. **许可红线**：源码可见、非开源，**只学概念不抄代码**；本调研只做机制归纳。
5. **反向印证**：对象 A/B/C 均指向「Spherse 记忆偏弱、缺辅助式/离设备调用」，对象 D 把这两点做成了完整系统，是最强的补齐参考。

## 二、它是什么

- **形态**：自建「手机 OS」壳——桌面/图标网格/Dock/通知/浮球返回，约 28 个 App：神经链接（角色）、记忆库、Message、电话、群聊、小小窝（含像素家园/记忆潜行）、查手机、见面、档案、存钱罐、交换日记、Spark（社交模拟）、自习室、TRPG、笔友会、写歌、彼方（VR 世界）、时光契约（定时）、世界书、热点、相册、自由活动、小红书图库、外观、攻略本、都市人生、特别时光、音乐、设置。
- **技术栈**：React + TS + Vite；**IndexedDB**（本地优先，图片二进制走 Blob）；**Cloudflare Workers** 作代理/后台（联网搜索、热榜、云备份、点单 MCP、TTS、音乐等）；**Capacitor** 打安卓包；Web Push；JSZip。
- **local-first**：无中心数据库；数据默认只在本机。备份可选本地 zip / WebDAV / GitHub / Supabase（向量）。
- **许可**：专用「源码可见许可」——个人非商业学习研究可看/运行未修改版本；二改、再分发、使用官方后端另需书面授权。**第三方资源与官方服务分离**。

## 三、与 Spherse 的关系

| | 对象 D | Spherse |
|---|---|---|
| 角色 | 「AI 陪伴 OS」垂直整机 | **通用 agent 运行时**，承载任意 Workspace |
| 形态 | 自建手机 OS 壳 + ~28 App | 桌面/Web 壳 + HTML 卡 Workspace |
| 存储 | IndexedDB（local-first） | 项目目录 + `.data.json`/`.card.json` + SQLite |
| 运行时 | 前端生成 + 用户自部署 CF Worker 后台 | self core（session/capability/skill/trigger/mcp） |
| 记忆 | **向量记忆库**（七脑区/衰减/巩固/检索/门牌） | 关键词 JSONL + 近 20 条注入 |
| 上下文装配 | `ContextBuilder.buildCharacterRequest`（全 App 统一入口） | agent-assembly + contextBlocks + worldbook projector |
| 世界书 | position/order/**depth/role** 逐条注入（SillyTavern 子集） | 关键词命中 → 统一 `<worldbook>` 块 |
| 主动/自动化 | **主动消息 2.0**：离设备生成 + Web Push + 副作用回放 | trigger（cron/event）+ TimerService（仅在 server 内） |
| MCP | 用户自配远程 MCP（两层容错 / 绑定 / worker 侧执行） | MCP client（native tool_calls） |
| 语音 | 电话 + 多供应商 TTS（MiniMax/Fish/ElevenLabs） | 浏览器朗读（chat） |
| 备份 | zip / WebDAV / GitHub / Supabase | 项目目录（无内置云备份） |

**判断**：对象 D 与 Spherse 是「同一问题两种解法」的极端版——它把陪伴产品所需的记忆、主动、多 App、语音全部内建；Spherse 提供可组合原语。对象 D 的价值在于**它把 Spherse 目前最弱的两块（长期记忆、离设备自动化）做成了完整系统**，可直接作为设计与演进参考。

## 四、架构要点（摘要）

### 4.1 记忆库（核心）

- **七房间（映射脑区）**：客厅（海马体，容量 200，快衰减 ~1 天剩 6.5%）、卧室（新皮质，慢衰减）、书房（前额叶）、用户房（颞顶联合区）、自我房（默认模式网络，**永不衰减**）、阁楼（杏仁核-海马，永衰减=潜伏）、窗台（多巴胺奖赏，永不衰减）。
- **存入管线**：热区（最近 N 条留上下文）→ 缓冲 M 条达阈值触发 → LLM 提取（第一人称视角→第三人称 JSON：`content`/`room`/`importance 1-10`/`mood`/`tags`）→ 向量化（batch 20，如 `text-embedding-3-small` 1024 维，余弦 >0.9 去重，事务写）→ 链接构建（时间/情绪自动 + LLM 因果/人物/隐喻）→ 巩固（客厅→卧室晋升：重要度≥8 立即 / ≥6 且 >24h / 回忆≥3 次；客厅溢出→阁楼）。
- **按角色的水位线**：三档 `200/100`、`100/50`、`50/20`（保留原文数 / 触发缓冲数），`PROCESS_RATIO=0.85`，高水位 localStorage 防重。
- **检索管线**：查询源清洗（去图片/语音/卡片噪声）→ 向量 85% + BM25 15% 混合 → 房间权重打分（各房间相似度/时近性/重要性权重不同）→ 扩散激活（按角色性格：感性/叙事/意象/分析，沿链接 ≤+5 条）→ 情绪启动（匹配当前 mood ×1.3）→ 反刍（概率从阁楼冒 1 条）→ 格式化注入（上限 12 条）。
- **房间门牌（情景→语义固化层）**：四块常驻门牌——「TA的事」（用户房 12）、「我是谁」（自我房 10）、「我们之间」（卧室 10）、「我的领域」（书房 8）；每轮**直接注入 system prompt、走「约束」而非「话题」**（"你早已知道的背景，不要主动提起"）；合并语义=全量替换 + `basedOn` 继承溯源。
- **认知消化**：每 50 轮/手动触发，纯状态机（阁楼创伤→解决/加深/淡化；窗台期盼→达成/失望；自我反刍→新困惑），概括类产出改道门牌，不再新建泛情感记忆；消化报告留最近 30 条。
- **期盼生命周期** / **共激活学习**（同时召回链接 +0.05）/ **情绪空间（Russell）**/ 可选 Supabase 向量同步 / 可选相对时间补注。

### 4.2 统一上下文装配

- `ContextBuilder.buildCharacterRequest({ char, user }, messages)` 是**所有 App 的唯一入口**：一次装配角色设定 + 世界观 + 用户档案 + 月度精炼记忆 + 印象档案（MBTI 等）+ 挂载世界书；App 只负责本场景玩法/输出格式/场景历史。
- 世界书公共管线：固定位置优先于 order → 同序保留挂载顺序；**depth 从实际发送历史末尾倒数（含本轮用户消息）**；scanDepth 只管扫描范围；条目 `role` 决定 system/user/assistant；概率同轮只抽一次；参考 SillyTavern World Info 语义（未全兼容）。
- 上下文可见范围 `chatContextRange.ts` 单一入口：自适应（水位线之后）vs 手动（最近 contextLimit 条）；用户断点只能收窄；有 parity 测试对照各入口一致。

### 4.3 主动消息 2.0 / 即时对话

- **每个用户自部署一个 CF Worker**：聊天回复改在云端生成，成功/失败结果走 **Web Push** 下发；客户端发完即自由（切后台/杀进程皆可）。
- **可靠性**：任务先落 D1（落盘即受理）+ 同请求 `waitUntil` 开跑 + cron 拾起仍 pending 的行；认领标记防双跑；本地仍是唯一真相（增量 + 游标对账，超出走整包 gzip 重传）。
- **副作用「云端只识别、客户端执行」**：worker 就地跑只读工具（回忆/搜索/日记/小红书），戳一戳/转账/日程/音乐/点赞这类副作用**结构化成 directives 挂在推送上**，客户端收到后由 `applyAssistantPostProcessing` 重放本地执行。
- **无流式**，用「正在输入」指示；凭据 `credRefs` 加密上云；停止经租约心跳传播。

### 4.4 MCP 客户端

- 用户自配远程 MCP（Streamable HTTP），工具清单持久化；绑定到角色/群聊；三种网络路径（直连/本地代理/自己的 Worker 代理）。
- **两层容错**：native `tool_calls` → 不支持的模型把调用写成正文文字时，用 `extractTextFakedMcpCalls` 提取并代执行回喂。
- 即时对话路径下 MCP 由 amsg worker 云端执行；工具结果上限 20k 字符；停止信号传入握手与调用。

### 4.5 其它

- **App 注册表模式**：`AppID` 枚举 + `INSTALLED_APPS` 数组 + `renderApp()` switch + Dock；新 App 自足并复用 ContextBuilder。
- **构建期门禁的开发工具**：BuildBadge + DevDebugPanel 由 Vite `define` 编译时常量控制，release 分支构建整棵树摇掉，用户看不到。
- **local-first 备份矩阵**：本地 zip / WebDAV / GitHub 私有 repo / Supabase 向量，全用用户自己的账号。

## 五、可吸收清单（按价值，落点建议 skill/模板或基建，不改内核）

1. **记忆库作为 Spherse 记忆演进的完整设计规范**（最高价值）：七房间/衰减/巩固/混合检索/扩散激活/情绪启动/反刍。→ 直接喂给 Spherse 记忆域（`LanceDB + FTS5` 方向）作为需求与算法参考。**首选吸收项。**
2. **房间门牌（情景→语义固化 + 常驻约束式注入）**：把「抽卡式情景召回」补成「常驻的语义背景」。→ 小而高价值，可独立于整套宫殿先行。
3. **世界书逐条 `position/order/depth/role` 注入**：Spherse 现只注入统一块，缺逐条深度与角色。→ 提升 roleplay Workspace 的还原度。
4. **统一上下文装配约定**（每 App 一个 `buildCharacterRequest` 入口）：与 Spherse 的 agent-assembly/contextBlocks 同构，可作为「Workspace 上下文装配」的规范与 parity 测试思路。
5. **主动消息「云端识别副作用、客户端执行」**：一个安全且优雅的离设备自动化模式。→ Spherse trigger/移动端演进参考。
6. **MCP 两层容错**（native + 文本假调用提取）：对不支持 function calling 的模型。
7. **上下文可见范围 / 水位线 / 用户断点**：AI 可见范围 ≠ 存储范围，与 Spherse compaction 互补。
8. **情绪空间 / mood 检索 / 个性驱动**：陪伴型 Workspace 的场景化检索选项。
9. **local-first 备份矩阵**（WebDAV/GitHub/Supabase/zip）：Spherse 备份目标参考。→ **拟作 v1.4.x：软件内快速备份插件**。
10. **每角色 API + `credRefs`**：每角色默认模型/凭据 + 服务端凭据引用，对多角色 Workspace 与云后台有意义。

## 六、可行性裁决：Spherse 能否复刻

**判断**：不能零改动复刻其「整机」，但**玩法骨架可由一个/多个 Workspace 承接**；瓶颈集中在四块 Spherse 现状缺失的能力。

### 6.1 能直接映射
- 角色/会话/多 Agent、MCP client、trigger（cron/event）、世界书（有但粗）、HTML 卡承载 UI 子集、`.data.json` 存储。

### 6.2 需变通
- **OS 壳 / 多 App**：在单个 HTML 卡内自建桌面/导航（无内置应用壳，与对象 C 结论一致）。
- **每角色 API**：Spherse 的 provider 是全局的；每 Agent 可选 model，但无每角色独立凭据。
- **备份**：项目目录可拷贝，但无内置 WebDAV/GitHub/Supabase 备份。→ **拟作 v1.4.x：软件内快速备份插件**。
- **构建期门禁开发工具**：Spherse 用运行时开关（debugTools），非编译期摇树。

### 6.3 真缺口
1. **向量长期记忆**：Spherse 只有关键词 JSONL + 近 20 条注入，无向量、无衰减/巩固/扩散激活。**最大缺口。**
2. **后台/主动消息（离设备生成 + 推送）**：Spherse trigger 只在桌面 server 内跑 agent turn，无 Web Push、无离设备执行。
3. **世界书逐条 depth/role 注入**：现为统一 `<worldbook>` 块。
4. **多供应商 TTS / 语音通话**：Spherse 只有浏览器朗读。
5. **手机 OS 形态**（桌面/图标/通知）。

### 6.4 一句话
玩法可承接，但**「记忆库」与「主动消息」是 Spherse 目前缺得最实的两块**；这两块也正是对象 A/B/C 反复指向的同一处弱点。

## 七、明确不建议 / 不复用

- **不照搬其技术栈与整机形态**：手机 OS 壳 + 28 App 是垂直产品取舍，Spherse 走可组合 Workspace。
- **不把陪伴/记忆/游戏垂直能力做进 Spherse 内核**：与既有结论一致，落 Workspace/预设。
- **不抄代码**：许可为源码可见非开源，**只吸收概念与设计**，实现须独立。
- **不复用其官方后端/资源**：其中心代理与官方服务受容量与授权约束，不得依赖。

## 八、范围与不做

- 本调研不修改 `docs/dev/backlog.md`、不新增 backlog 条目。
- 不产出 design/plan，不改任何 `docs/official/` 文档。
- 对象 D 源码为只读参考（浅克隆后即弃），未做任何修改。
