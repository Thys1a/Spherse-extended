# 跨项目对照调研

> 本目录汇总跨项目对照调研（对象 A–E，代号指称、已隐去项目名与绝对路径）与 Spherse 自身/方法专题（05–09），回答同一组问题：**与 Spherse 的重合在哪、哪些值得吸收、哪些是重复投入**。
> 不改 `docs/dev/backlog.md`、不产出 design/plan、不改 `docs/official/`。

## 文档

| 文件 | 对象 | 一句话 |
|---|---|---|
| [`01-narrative-creation-tool.md`](./01-narrative-creation-tool.md) | 对象 A | 本地优先、人机协同的长篇叙事创作工具——重合边界、重复投入清单、可借鉴点；含「世界观撰写辅助增强提案（v1.1.x）」与「SDK 开放工作区文件写能力可行性（v1.1.x）」 |
| [`02-language-learning-app.md`](./02-language-learning-app.md) | 对象 B |  多语言学习应用（——语言学习功能的吸收裁决；含「用户提取的四个功能点（v1.2.x）」与「信息卡运用方向（v1.2.x）」 |
| [`03-language-immersion-game.md`](./03-language-immersion-game.md) | 对象 C | 构建在 Agent 运行时上的语言沉浸游戏参考实现——架构纪律、单 Workspace 复现可行性；含「衍生平台能力候选（v1.1.x / v1.3.x）」 |
| [`04-companion-os.md`](./04-companion-os.md) | 对象 D | 记忆宫殿（向量长期记忆）与主动消息（离设备生成 + 推送）是最强参考；含「可吸收点」与「Spherse 复刻裁决」 |
| [`10-worldview-timeline-tool.md`](./10-worldview-timeline-tool.md) | 对象 E | 世界观设定与时间轴管理 Web 应用（对象 A 的“设定侧”子集产品化）——唯一建议跟进的是顶栏常驻搜索 + `⌘K` 显式入口，正中 triage issue 3 |
| [`05-prompt-assembly.md`](./05-prompt-assembly.md) | Spherse 自身 | 一条 prompt 的拼接内容与顺序：system 段表、tools 顺序、每轮 wire 视图与流程图 |
| [`06-tavern-vs-agent.md`](./06-tavern-vs-agent.md) | 外部讨论 | 酒馆式提示词组装 vs Agent：worldbook 位置（近因偏见）+ 扩大注入、拼接顺序建议；「世界书挂载 tools」经复核列为不建议 |
| [`07-session-profile-feasibility.md`](./07-session-profile-feasibility.md) | Spherse 自身 | Session 级 profile 可行性——现状 model 覆盖为先例；建议最小覆盖集 |
| [`08-external-memory-libraries.md`](./08-external-memory-libraries.md) | 外部项目 | 外部长期记忆调研：框架对照 + 某陪伴类项目图谱记忆项目逐条 + 方向决策（内核单系统；向量为可手动开启的派生检索引擎） |
| [`09-token-usage-feasibility.md`](./09-token-usage-feasibility.md) | Spherse 自身 | 对话 token 数据 + 输入框预计 token 可行性——真实 usage 已采集、接口已有，主要是前端展示 |
| [`11-chat-bubbles-stickers.md`](./11-chat-bubbles-stickers.md) | 对象 B / 对象 D | 聊天多气泡与表情包机制对照——B 式 JSON 数组 vs D 式文本切泡、表情包双侧差异；§七为吸收裁决（内核 A1–A4 / HTML 定制 / 缺口 G1–G7），多气泡唯一出处归 `03 §九` |

**互补关系**：对象 B 偏「学」（词本 / SRS / 题型 / 复习），对象 C 偏「用」（在剧情里用目标语言沟通），对象 D 偏「陪伴 + 记忆 + 主动」的纵深。

## 排期总览（均为提案，非 design doc；落地前需评审）

### 功能排期

- v1.0.0：game engine ✅
- v1.1.0：writing copilot& storage
- v1.2.0：translator
- v1.3.0：mobile
- v1.4.0: other platform


| 版本 | 事项 | 出处 | 进度 |
|---|---|---|---|
| **v1.1.0** | 世界观撰写辅助增强（预设层，含数据格式 → 可视化 viewer） | 01 §十 | – |
| **v1.1.0** | SDK 开放工作区文件写能力（受限写 / 无删；需先补回滚发现路径） | 01 §十一 | – |
| **v1.1.0** | AI 输出解析 → chat 渲染（结构化块 / 多气泡分段）；AI 输出解析 → trigger | 03 §九；11 §五 | – |
| **v1.2.0** | 气泡翻译（机器翻译 / 翻译 LLM）、引号内词句样式、`/card:{prompt}` 独立调用、独立识图模型 | 02 §七 | – |
| **v1.2.0** | 信息卡运用方向（翻译老师 / 情景提示 / 文化注释/更多）；信息卡外部调取 / 卡内回写 | 02 §7.6 | – |
| **v1.1.0** | 记忆增强三线（零依赖增强 + 向量模式接口 + 缺口补齐） | 08 §九 | – |
| **v1.3.x（预备案）** | trigger → 跑脚本（非 agent） | 03 §九 | – |
| **v1.3.x** | 软件内快速备份插件（本地 zip / 云：WebDAV / GitHub / Supabase） | 04 §五 / §六 | – |
| 待评估 | 记忆方向：内核保持 `memory.jsonl` 单系统；向量为可手动开启的派生检索引擎（互斥、单真相源）；框架对照 + 目录项目逐条 + 当前代码盘点 + 外部写入方式 | 08 §一 / §四 – §七 / §十 / §十一 | – |
| 待评估 | 世界书逐条 depth/role 注入；主动消息（离设备 + 推送） | 04 §六 | – |
|待评估| subagent clawbot | | – |
| 待评估 | 显式搜索入口（顶栏常驻 + 快捷键，对象 E 式）与待确认队列卡片范式 | 10 §四 | ✅ |
| **v1.1.0** | 批注 | - | – |


### 优化&修订

| 版本 | 事项 | 出处 | 进度 |
|---|---|---|---|
| **v1.0.2** | 扩大 worldbook 注入（取消 `≤8 条 / 2000 token` 预算上限） | 06 §四；04 §六 | – |
| **v1.0.2** | worldbook 注入位置修正（从队尾 user 挪到当前用户消息之前） | 06 §四 / §五 | – |
| ~~v1.0.3~~ | ~~Session 级 profile 覆盖（最小集，复用 session model 覆盖管道）~~ | 07 | – |
| **v1.0.1** | 对话 token 数据 + 输入框预计 token 展示 | 09 | ✅ |
| **v1.0.3** | 状态数据外链（`.data.json` + `$state` 声明 + projector 注入；与 worldbook 位置修正同批，共用「插到当前用户之前」helper；设计见 `features/2026-10-11-state-data-link/design.md`） | 06 §五 #4 | – |
| **v1.0.1** | 小助手agent初始profile增加“如有疑问，向用户提问而非自作主张；如需执行，先给出计划并提问方案是否可行。” | -- | ✅ |
| **v1.0.1** | agent所属快捷回复 | -- | ✅ |
| **v1.0.1** | 合并上游版本 | -- | ✅ |
|**v1.0.x**| game engine p2 | | – |
|**v1.0.x**| 桌宠模式 | | – |
|**v1.1.x**| 事件触发器优化调整 | | – |
|待评估| SDK 会话消息订阅（`events.on("session:message")`，= G3）：可行，机制现成（订阅注册表加分支 + 桥订阅 chat store 推送）；四条硬约束——只许订阅自己会话（host 侧 source→session 映射强制，跨会话拒绝）、只推结算事件（不推 `message_update`，最小字段）、推送节流 + 订阅上限、外泄归沙箱（I6/U1）不归订阅 | 11 §七 | – |

进度：✅ = 已完成，– = 未开始。

## 共同结论

- **通用机制才吸收，垂直能力不进内核**：所有调研一致——Spherse 内核只提供数据 / 卡片 / UI / 触发 / 技能 / 记忆等通用机制，叙事、语言学习、游戏引擎、陪伴整机等垂直能力落 Workspace / 预设层。
- **复用对象侧已完成的竞品调研**：对象 A（评测框架 / 记忆框架选型）、对象 B（16 条外语学习提案的采纳与否决）的结论可直接引用，省去二次可行性判断。
- **反复出现的两处真实平台缺口**：
  - **辅助式调用**（不占用主对话、可指定独立 provider、结果只渲染 UI）——对象 B §7.5、对象 C §8.3。
  - **长期记忆与离设备调用**（向量化记忆、后台生成 + 推送）——对象 A/B/C 反复指向记忆偏弱，对象 D 把这两块做成了完整系统（§4.1 / §4.3），08 给出外部选型对照。

## 判定（不吸收）

- **叙事场景的检索排序**（01 §七 #4）：**不吸收为内核机制**——距离衰减依赖叙事结构元数据（intro 章节距离），与「叙事数据模型不进内核」一致；仅留作叙事类 Workspace 的场景化排序选项。
- **变量驱动状态机**（06 §五 #4）：不作为领域「状态引擎」进内核；提出**通用机制方案「状态数据外链」**（软链 `.data.json` + `$state` 声明 + projector 注入），设计见 `docs/dev/features/2026-10-11-state-data-link/design.md`。

## 范围与不做

- 不修改 `docs/dev/backlog.md`、不新增 backlog 条目；不产出 design/plan；不改任何 `docs/official/` 文档。
- 对象的原始文档与源码均为只读引用，未做修改。
