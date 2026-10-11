# 外部长期记忆调研：框架对照 + 目录项目逐条 + 方向决策

调研时间：2026-10-10
目的：盘点外部开源的「跨对话 / 跨会话长期记忆」方案（框架 + 目录项目），评估 Spherse 是否该用、还是自研
背景：相关对象产品 反复指向「Spherse 记忆偏弱」（关键词 JSONL + 近 20 条注入）；某陪伴类产品 的记忆宫殿（七房间 + 巩固 + 检索）是参考设计。
许可口径：以下均为开源项目，**只学思路、不搬代码**。

## 一、结论

1. **不整体引入任何框架**：主流四个（抽取式记忆框架 / 图记忆框架 / OS 式分级记忆运行时 / 图向量 ECL 平台）全是 **Python 生态 + 需要外部向量/图数据库**，与 Spherse 的「TS 单一运行时 + 本地优先 + SQLite/本地向量库」不匹配，引入即多一套服务与语言边界。
2. **吸收三条可独立落地的“架构模式”**（不依赖框架）：① **双时态事实**（图记忆框架：`valid_at` / `invalid_at`，矛盾时失效而非覆盖）；② **混合检索 + RRF**（抽取式记忆框架 v2：向量 + BM25 + trigram，`Σ 1/(60+rank)`）；③ **休眠期巩固 / 双 Agent**（OS 式分级记忆运行时：主对话不写记忆，旁路 worker 异步改写）。
3. **自研方向不变**：与某叙事创作工具 结论一致——`本地向量库 + SQLite FTS5` 混合检索；某陪伴类产品 记忆宫殿（七房间/衰减/巩固/门牌）作为领域设计参考。
4. **目录项目反复印证**：某陪伴类项目图谱 的记忆项目不约而同地做「**审核 / 置信度 / 衰减 / 睡眠整理 / Markdown 真源**」，而不是单纯堆向量——支持「模式 > 框架 > 跑分」的选型观。
5. **方向决策（§五 / §六）**：内核始终只有**一套记忆**（现有 `memory.jsonl`）；向量若要出现，只能是**可手动开启的派生检索引擎**（互斥开关、JSONL 唯一真相源、API 不变），而不是第二套独立存储；自动 / 重型长期记忆落 Workspace。

## 二、主流框架对照

| 框架 | 记忆模型 | 存储 | 语言/许可 | 何时选它 | 对 Spherse |
|---|---|---|---|---|---|
| **抽取式记忆框架**（~57k★） | 抽取式事实记忆（LLM 抽取→去重→向量/可选图） | 可插拔向量，可选图 | Python，Apache-2.0 | 每用户画像、多租户、最快上手 | 借鉴：抽取管线 + **RRF 混合检索**；不引入 |
| **图记忆框架**（~27–30k★） | **双时态知识图**（事实有有效期，矛盾失效不删） | 需图库（图数据库） | Python，Apache-2.0 | 事实随时间变化的场景 | 借鉴：**双时态事实**模式（可纯 SQL 实现）；不引入图库 |
| **OS 式分级记忆运行时**（~23–24k★） | OS 式分级（core/recall/archival），**Agent 自编辑记忆** | 外部关系数据库/SQLite | Python，Apache-2.0 | 长跑自我进化 Agent（整套运行时） | 借鉴：**core memory 块 + 休眠期巩固**；不引入运行时 |
| **图编排记忆库**（~1.5k★） | 图编排框架 原生（semantic/episodic/procedural） | 图编排框架 store | Python，MIT | 已深度用 图编排框架 | 不相关（Spherse 非 图编排框架） |
| **图向量 ECL 平台**（~30k★） | 图 + 向量 ECL 管线，14 检索模式，反馈加权 | 图 + 向量 | Python，Apache-2.0 | 语料级「让文档可召回」 | 借鉴：反馈加权边；不引入 |
| **结构化画像服务**（~2.8k★） | 每用户结构化演进画像 | 结构化 | Python，Apache-2.0 | 只要一个聊天画像 | 最轻，但仍 Python 服务 |

> 基准（某对话记忆基准 / 某长时记忆评测集）厂商自报互不一致、且相互反驳，**不作为选型依据**。选型按「记忆的种类」而非跑分。另有一条反直觉证据：OS 式分级记忆运行时 的「纯文件系统 + 基础文件操作」在 某对话记忆基准 上取得 74%，超过不少专用记忆工具——「可靠检索 + 明确分层」比「框架复杂度」更重要。

## 三、值得吸收的三条模式（与 Spherse 落点）

1. **双时态事实**（图记忆框架）：事实表加 `valid_at` / `invalid_at` / `source_event_id`；新事实与旧事实冲突时把旧行 `invalid_at=NOW()`（**失效而非删除**），支持「现在为真？」与「当时为真？」两类查询。→ 纯 SQLite/SQL 即可实现，适合 Spherse 的本地存储；与某陪伴类产品 记忆宫殿的「衰减/巩固」互补。
2. **混合检索 + RRF**（抽取式记忆框架 v2）：向量余弦 + BM25(`ts_rank`) + trigram 各取 top-N，按 `Σ 1/(60+rank_i)` 融合。→ 与某叙事创作工具 定的 `本地向量库 + FTS5` 方向一致，RRF 是融合层的现成公式（约 15 行）。
3. **休眠期巩固 / 双 Agent**（OS 式分级记忆运行时）：主对话 **不直接写记忆**；旁路 worker（可定时）读近段上下文、异步改写记忆块/事实、可失效旧事实。→ 对应 Spherse 的 trigger（cron）+ 独立会话；是「记忆整理不污染主上下文」的范式。

补充可选：抽取式记忆框架 的「抽取-去重-更新」管线、OS 式分级记忆运行时 的 core-memory 块自编辑、图向量 ECL 平台 的 反馈加权（用反馈调整边权）。

## 四、某陪伴类项目图谱 记忆项目逐条调研

> 来源：某陪伴类项目图谱（隐去来源，约 180 项目）。以下 11 个与长期记忆直接相关，已逐页核实；用途是持续项目发现源，**只学思路不搬代码**。

| 项目 | 机制一句话 | 平台/许可 | 对 Spherse 的启发 |
|---|---|---|---|
| **项目 1** | 三节奏维护长期记忆：即时捕获 → 夜间抽取 → 周期 rollup，**候选审核队列**（人决定什么真正留下），跨客户端共享（某云平台） | TS，AGPL-3.0 | **审核队列**（人裁决进长期库）+ 三层节奏；缺点是绑某云平台 |
| **项目 2** | Smart Notes（优先召回）/ Session Logs（完整档案）/ Facts（**verified / high_probability / false 三档置信度**）+ 来源标签 + 冲突裁决 + 语义搜索 + MCP/REST | Python/自托管，MIT | **置信度分级 + 冲突人工裁决**（Spherse 的 recall 连排序都没有）；MIT 可放心学 |
| **项目 3**（原记忆网关） | **云端 embedding 服务 兼容转发网关**：碎片/事件/核心三层 + 提取/合并/撤回 + 关键词＋向量混合 + A/B 分区缓存；客户端只改 API 地址 | Python/外部关系数据库，AGPL-3.0 | 「网关式」记忆（无侵入接入任意客户端）+ 缓存分区降成本的思路 |
| **项目 4** | 长期记忆**独立 MCP Server**：跨会话/客户端/模型共享；网页端 diff 审查/接受/回滚；人格 namespace 隔离 | 自托管，SQLite/外部关系数据库 | **记忆即独立 MCP 服务 + 可回滚**——与 Spherse 有 MCP client + `rollback_turn` 的现状天然呼应 |
| **项目 5** | **Markdown 桶为真源**（可读可编辑）+ 效价/唤醒度情绪坐标 + 衰减 + 关键词/BM25/向量混合 + 可回看原文 | MCP，MIT | **Markdown 真源**（人类可审，与 Spherse「可读格式」哲学一致）+ 情绪衰减 |
| **项目 6** | 短期/长期 + **记忆热度**（访问/时间/重要性）+ 睡眠整合 + 日历层级摘要（日→周→月） | Python，源码公开 | 热度调度 + 睡眠整理（≈某陪伴类产品 巩固的轻量版） |
| **项目 7** | 向量/BM25-模糊/时间衰减/重要度**四信号混合检索** + append-only 事件 + 人工策展 + drive/concern 主动 + 自审 + 可复现检索评测 | Node/外部向量库/MCP，AGPL-3.0 | **四信号混合检索公式** + 人工策展 + 「评测先行」；Node 栈相对可借鉴 |
| **项目 8** | 某机器人平台 插件：写入/召回/**衰减生命周期** | 某机器人平台，AGPL-3.0 | 生命周期的最小实现（插件级即可，不必整套系统） |
| **项目 9** | Scribe/Archivist/Librarian 三段流水线（事实→星座→篇章）+ 关键词/向量/实体聚合 + **证据链可追溯** | Node/SQLite/某向量库，MIT | 分层流水线 + 每条记忆保留原始引用（审计友好） |
| **项目 10** | L1 轨迹 / L2 策略 / L3 世界模型 / 结晶 Skill；反馈驱动召回 | Python，Apache-2.0 | 记忆→能力结晶（与技能演进呼应） |
| **项目 11** | 抽取式记忆框架 兼容 API；语义去重 + 长期对话 + 多模态视频 | Python/MCP，Apache-2.0 | 去重 + 兼容面设计 |

**跨项目共识**：审核（人裁决什么进长期库）、置信度、衰减/热度、睡眠整理、Markdown 真源、混合检索——**没有一个项目只靠「向量」**。这印证：Spherse 若要做强记忆，走的是「检索 + 整理 + 治理」组合，而非单一向量库。

## 五、记忆方向决策

### 现有 `memory.jsonl` 是什么（代码事实）

- per-agent `.spherse/agents/{slug}/memory.jsonl`，append-only JSONL（`store/memory.ts:12,78-90`）。
- 两个工具：`memory_save`（显式写入）与 `memory_recall`（检索）。
- 检索 = **大小写不敏感子串**匹配 content/tags，**返回全部命中、无排序**（`memory.ts:30-38,74-76`）。
- 每轮自动注入 **最近 20 条**为 `<memory>` system 块（`capabilities/memory/index.ts:10,39-51`）。
- 特征：**显式、关键词、小规模、零 provider 依赖、离线可用、透明可审计**；弱在无语义、无自动抽取、注入上限小。

### 向量化记忆会多出什么

语义召回（措辞不同也能命中）、自动从对话抽取 + 巩固（某陪伴类产品 记忆宫殿）、大规模历史；代价是 **embedding provider 依赖**、向量库、抽取/巩固管线与复杂度。

### 是否重叠：是

两者都在回答同一件事——**跨轮 / 跨会话地「记住并召回」**，只是实现不同（显式关键词 vs 自动语义）。同时存在会导致：**双份真相**（同一事实两处各存一条，甚至冲突）、**agent 选择困难**（不知该用哪个）、**运维翻倍**（两套存储/备份/回滚）。→ **内核不应并行两套记忆，应二选一。**

### 二选一

| 方案 | 说明 | 判定 |
|---|---|---|
| **A. 保留现有 JSONL（不放向量）** | 内核记忆保持显式 + 关键词 | **推荐**：契合「最小内核 + 零 provider 依赖 + 本地优先」 |
| **B. 加入向量记忆为第二套内核** | JSONL + 向量库并存 | **否决**：与 A 重叠、双份真相、拉 embedding 依赖进内核 |
| **C. 单系统升级**（保留 `memory_save/recall` API，把检索换成混合：关键词 + 可选 embedding + 排序/时近） | 一套存储、一套 API，检索变强 | **条件触发**：仅当内核记忆确成瓶颈、且接受 embedding 依赖时；**替换** A 的检索实现，不并存 |

**结论**：现在不需要给内核加向量化记忆；向量/自动长期记忆若要做，落 **Workspace 层**，不进内核。若只想让常规记忆更好用，先做**零依赖增强**：改进 `memory_recall` 的排序/时近/标签权重即可。

## 六、后续问题（2026-10-10）：06-07 实现状态 / 综合建议 / 手动切换

### 6.1 `docs/dev/investigation/2026-06-07-agent-memory.md` 是否已实现

**结论：绝大部分未实现；只有「每 agent 一份记忆 + 读写工具 + 每轮注入」的最小意图被简化承接。**

| 文档主张 | 现状 | 判定 |
|---|---|---|
| per-agent 独立记忆 | `.spherse/agents/{slug}/` + `memory.jsonl` | ✅ 意图实现（形式不同） |
| 5 个 memory tool（remember/recall/update/forget/core_edit） | 仅 `memory_save` / `memory_recall` | ⚠️ 部分（近似 2/5） |
| Core Memory 恒注入 | 最后 20 条 `<memory>` 注入 | ✅ 意图实现（简化） |
| Agent 面板开关 memory | `profile.tools` 声明 | ✅ 等价 |
| Core Markdown 块 + `core_memory_edit/read` | 无 | ❌ |
| Episodic SQLite+FTS5 / Semantic SQLite+本地向量库 / 向量 / embedding | 无 | ❌ |
| 抽取管线 / 双时序 / 衰减 / 实体注册 / RRF | 无 | ❌ |
| `memory/{core,episodic,semantic,vector}` 目录布局 | 无（只有 `memory.jsonl`） | ❌ |
| 百兆级（本地向量库 + mmap） | 无从验证 | ❌ |

另：其配套假设已过时（Agent 存 `*.md`、有 `createToolsForProject`、`startsWith` 路径校验）——现为 profile.md/agent-dir、capability 装配、`assertInsideProject`。读它只取方向，不取实现细节。

### 6.2 综合主流框架与目录项目，给出什么建议

（在 §一–§五基础上，合并 06-07 的分层与目录项目的共识）

1. **保留三层概念，压缩为两层实现**：06-07 的 Core / Episodic / Semantic 是对的，但通用运行时只需两层——**Core（显式、恒注入、人类可读）+ 按需召回（显式关键词，未来可换引擎）**。Episodic/Semantic 的区分对通用运行时过早。
2. **先吸收零依赖的治理，不吸收重型检索**：置信度/版本化、衰减/热度、休眠期整理（trigger）、人类可审（JSONL 本就是）。向量/图库只随开关出现。
3. **检索公式用 RRF**：若上混合检索，用 `Σ 1/(60+rank)` 融合关键词/BM25/向量/时近各取 top-N。
4. **不引入框架本体**（重申），选型不看跑分。

### 6.3 JSONL 与向量能否并存、由用户手动切换

**可行，但必须同时满足三个条件，否则回到双份真相。**

- **条件 1（互斥）**：同一时刻只生效一种，由**配置开关**决定（per-agent，如 profile `memory.mode: simple|vector`），**不是**运行时 agent 自选。
- **条件 2（单一真相）**：`memory.jsonl` 仍是**唯一数据源**；向量索引是其**派生缓存**（随 save/edit/delete 重建、可整体重建），不得成为第二套独立存储。
- **条件 3（API 不变）**：`memory_save/recall` 与 `<memory>` 注入签名不变，只换检索实现；注入块默认仍是显式最近条目（向量只管 `recall`），避免注入语义漂移。

满足三条件 → 本质是「**一个存储、两种检索引擎、手动开关**」，双份真相与 agent 选择困难消失；embedding 依赖只在打开向量模式时才被需要（懒加载）。

仍要诚实说明的成本：embedding 模型（~120MB 首用下载）+ 向量库（本地向量库 / sqlite-vec）进 Electron 打包链，属**中–大**改动；每次写入都要重嵌或排队；仍建议先做零依赖排序（时近/标签/频次）。

**修订后的二选一**：不是「JSONL 还是向量留其一」，而是「**默认 JSONL；向量作为可手动开启的派生检索引擎**」。内核依旧只有一套记忆。

## 七、当前记忆代码状态（盘点，2026-10-10）

> 与 §五/§六 的方向结论对照：以下即「现有 `memory.jsonl`」的真实边界。

| 面 | 文件 | 状态 |
|---|---|---|
| 存储 | `store/memory.ts` | `MemoryStore`：append-only JSONL（`MEMORY_FILE`）；`MEMORY_PATH_RULE`；`filterEntries` = 大小写不敏感子串（content/tags），返回**全部命中、无排序、无上限** |
| 能力 | `capabilities/memory/index.ts` | `memory_save` / `memory_recall` + `<memory>` 块（**最后 20 条**，`RECENT_LIMIT`；装配快照，非每轮实时——无 turnHooks）；per-agent 作用域；`onAgentDeleted` 清理 |
| 工具 | `tools/memory-save.ts`（`content` + 可选 `tags`，回 id，无审批）、`tools/memory-recall.ts`（空 query = 全量） | 便捷入口，非独占——LLM 经 path 规则也可直读写该文件 |
| 权限 | `access` path 规则 | LLM **可读可写**（memory 类）；server 可读、**默认不可写**（`path-rules.test.ts:37-39`） |
| 预置 | `presets` | assistant 默认启用除 `run_command` 外全部工具（含 `memory_*`） |
| 归因 | `tool-attribution.ts:148-153` | `memory_save` 产 `{type:"memory"}` sideEffect，但 **`rollback_turn` 跳过 memory**（只覆盖 data/card） |
| 契约/路由/UI | 无 | **无** memory 专用 contract、server 路由、前端 UI（app 无 `memory_save/recall/jsonl` 引用）；`contracts/websocket.ts:68` 只有 sideEffectRef 的 `"memory"` 字面量 |
| 测试 | `__tests__/capabilities/memory.test.ts` | store + tools + path rule |
| 消费方 | 仅自身 | 只有 memory capability 的 tools + contextBlocks 在用；**无其他调用方** |
| 相邻但非记忆 | — | compaction digest（压缩）、session events（历史）、worldbook（关键词注入）、changelog（项目日志）、trigger（事件）——都不走 `memory.jsonl` |

**对照结论**：

- 现状 = 「显式小规模 + 子串 + 固定注入」，与 §五「保留现有 JSONL」一致；没有 embedding/向量/排序/衰减/抽取，**不需要先动它**。
- 若按 §六 6.3 做「手动切换检索引擎」：改动面仅 `filterEntries` 换实现 + 派生索引 + 配置开关，`memory_save/recall` 与 `<memory>` 签名可不动；但仍是**中–大**改动（embedding 进打包链）。
- 真缺口（若立项）：recall 无排序/上限、`memory_save` 只有增（无改/删工具）、无 server 管理面（用户在 UI 里看不见记忆）、`rollback_turn` 不覆盖 memory。

## 八、明确不建议

- **不引入框架本体**（Python + 外部 DB 服务），不引入图数据库。
- **不按厂商跑分选型**；不因「别人用了」而加依赖。
- **不照搬 分级记忆运行时/OS 式分级记忆运行时 的整套 Agent 运行时**。
- **不引入目录项目本体、不搬代码**；只学思路。
- **内核不并行两套记忆**（方案 B 否决）。

## 九、记忆增强方案设计（v1.2.x 候选）

> 用户决策：三线并行（零依赖增强 + 手动切换向量模式 + 补齐缺口）；embedding 暂抽象接口，sqlite-vec 方向。

### 9.0 前置事实：当前写入靠什么

| 写入者 | 路径 | 说明 |
|---|---|---|
| agent（官方入口） | `memory_save` → `MemoryStore.save` → `appendFile` | 唯一经归因（`{type:"memory"}`）的写入 |
| agent（旁路） | `write_file` / `edit_file` 直写 `memory.jsonl` | `MEMORY_PATH_RULE` 允许 LLM 读写（`path-rules.test.ts:25-26`），绕开工具与归因 |
| 人/开发者 | 运行时之外直接改文件 | 无审计 |
| 系统自动写入 | **无** | compaction/trigger/事件管线均不写；`appendFile` 仅 `store.save` 一处 |
| 删除 | 删 agent 时整目录删除；`onAgentDeleted` 只清注册表缓存，不删盘 | — |

结论：写入只有 agent（工具或直写）+ 人，**无系统自动行为**；直写旁路由工具不是独占门。方案用改/删工具 + 归因覆盖部分收口，直写通道留待评估阶段处理（禁止或文件监听）。


---


### 目标
1. **零依赖增强**：改进 `memory_recall` 检索质量（排序/时近/上限），无新依赖
2. **手动切换向量模式**：per-agent 开关，JSONL 唯一真相源，sqlite-vec 派生索引，embedding 接口抽象
3. **补齐缺口**：改/删工具 + UI 管理面 + rollback 覆盖

---

### 一、零依赖增强（改动面：core）

#### 1.1 `filterEntries` 增强（`store/memory.ts`）

**现状**：子串匹配，返回全部、无排序、无上限。

**改为**：
```typescript
filterEntries(query?: string, opts?: {
  limit?: number;        // 默认 20
  sortBy?: 'recency' | 'frequency' | 'relevance';  // 默认 recency
  tagBoost?: number;     // tag 命中权重，默认 2.0
}): MemoryEntry[]
```

**排序逻辑**：
- `recency`：按 `created` 降序
- `frequency`：按条目被 recall 的命中次数（需在 entry 加 `hitCount`，每次 recall 命中 +1）
- `relevance`：综合分（时间衰减 × 关键词命中 × tag 权重）
  - 时间衰减：`1 / (1 + daysSince/30)` （30 天半衰期）
  - 关键词命中：content 命中 +1，tag 命中 `× tagBoost`
  - 最终分 = `(contentHits + tagHits × tagBoost) × timeDecay`

**上限**：默认返回 top-20，避免注入爆炸。

**改动文件**：
- `store/memory.ts`：`filterEntries` 签名 + 实现（~40 行）
- `store/memory.ts`：schema 加 `hitCount?: number`，recall 时 +1（append 新行或内存计数）
- `tools/memory-recall.ts`：透传 `limit/sortBy` 参数（schema 扩展）

**测试**：
- `memory.test.ts`：新增排序/上限/衰减/tag 权重用例

---

#### 1.2 `<memory>` 注入策略可配置（`capabilities/memory/index.ts`）

**现状**：固定末 20 条。

**改为**：per-agent 配置 `profile.memory.injection`：
```typescript
{
  strategy: 'recent' | 'relevant' | 'none';  // 默认 recent
  limit: number;                              // 默认 20
}
```
- `recent`：末 N 条（现状）
- `relevant`：若当前 turn user 消息有关键词，用 `filterEntries(keywords, {sortBy:'relevance'})`
- `none`：不自动注入（agent 按需 `memory_recall`）

**改动文件**：
- `types/agent-profile.ts`：schema 加 `memory?: {injection, limit}`
- `capabilities/memory/index.ts`：`buildContextBlocks` 读配置，调整注入逻辑（~20 行）

**测试**：
- `memory.test.ts`：三种策略 + limit 覆盖

---

### 二、手动切换向量模式（改动面：core + contracts，可选打包链）

#### 2.1 架构约束（满足 §六 6.3 三条件）

1. **互斥开关**：`profile.memory.mode: 'simple' | 'vector'`（默认 `simple`）
2. **单一真相**：`memory.jsonl` 唯一数据源；`.spherse/agents/{slug}/memory.vec.db`（sqlite-vec）是**派生缓存**，随 save/delete 同步写，可整体重建
3. **API 不变**：`memory_save/recall` 签名不变，`<memory>` 注入不变，只换 `filterEntries` 实现

#### 2.2 Embedding 接口抽象（`core/embedding`）

```typescript
// core/src/embedding/types.ts
export interface EmbeddingProvider {
  name: string;
  embed(texts: string[]): Promise<number[][]>;  // 返回 [batch_size, dim]
}

// core/src/embedding/registry.ts
export class EmbeddingRegistry {
  providers = new Map<string, EmbeddingProvider>();
  register(provider: EmbeddingProvider): void;
  get(name: string): EmbeddingProvider | undefined;
}

// 内置空实现（懒加载时若无 provider 则报错）
export const NULL_PROVIDER: EmbeddingProvider = {
  name: 'null',
  async embed() { throw new Error('No embedding provider configured'); }
};
```

**暂不实现具体 provider**（本地 embedding 库 / 云端 embedding 服务 client），只留注册口；后续 feature 分支按需补。

**改动文件**：
- `core/src/embedding/{types,registry}.ts`（新增，~50 行）
- `core/src/index.ts`：导出 `EmbeddingProvider` / `EmbeddingRegistry`

---

#### 2.3 向量索引管理（`store/memory-vector.ts`）

```typescript
import Database from 'better-sqlite3';
import type { EmbeddingProvider } from '../embedding/types.js';

export class MemoryVectorIndex {
  private db: Database.Database;
  private provider: EmbeddingProvider;

  constructor(agentDir: string, provider: EmbeddingProvider) {
    this.db = new Database(path.join(agentDir, 'memory.vec.db'));
    this.provider = provider;
    this.initSchema();
  }

  private initSchema() {
    // CREATE VIRTUAL TABLE vec USING vec0(id INTEGER PRIMARY KEY, embedding FLOAT[768])
    // 实际 dim 按 provider 动态
  }

  async rebuild(entries: MemoryEntry[]) {
    // 读全部 entries，批量 embed，写入 vec 表
  }

  async add(entry: MemoryEntry) {
    const [emb] = await this.provider.embed([entry.content]);
    // INSERT INTO vec
  }

  async search(query: string, limit: number): Promise<string[]> {
    const [qEmb] = await this.provider.embed([query]);
    // SELECT id FROM vec ORDER BY distance(embedding, ?) LIMIT ?
    return ids;  // 返回 entry.id 数组
  }

  close() { this.db.close(); }
}
```

**要点**：
- `vec0` 虚拟表需 `sqlite-vec` 扩展（lazy load，若 `mode=vector` 时找不到扩展则报错提示用户安装）
- `rebuild` 在：① 首次开启向量模式；② 用户手动触发「重建索引」
- `add` 在：`memory_save` 若当前 agent `mode=vector`

**改动文件**：
- `store/memory-vector.ts`（新增，~120 行）
- `store/memory.ts`：`MemoryStore` 加 `vectorIndex?: MemoryVectorIndex`，构造时按 profile 决定是否创建

---

#### 2.4 `filterEntries` 双模式（`store/memory.ts`）

```typescript
filterEntries(query?: string, opts?: {...}): MemoryEntry[] {
  if (!this.vectorIndex) {
    // 原逻辑：子串 + 排序（§一）
  } else {
    // 向量模式：混合检索 + RRF
    const vecIds = await this.vectorIndex.search(query, opts.limit * 2);
    const keywordIds = this.filterBySubstring(query, opts.limit * 2);  // 原逻辑
    const merged = RRF([vecIds, keywordIds], opts.limit);  // Σ 1/(60+rank)
    return merged.map(id => this.entries.find(e => e.id === id));
  }
}
```

**RRF 实现**（~15 行，参考 抽取式记忆框架 v2）：
```typescript
function RRF(rankedLists: string[][], k = 60): string[] {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) || 0) + 1 / (k + rank));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}
```

**改动文件**：
- `store/memory.ts`：`filterEntries` 加分支 + RRF 函数

---

#### 2.5 Profile schema（`types/agent-profile.ts`）

```typescript
memory?: {
  mode?: 'simple' | 'vector';          // 默认 simple
  injection?: {...};                   // §一的配置
  embeddingProvider?: string;          // 若 mode=vector，指定 provider name
}
```

**改动文件**：
- `types/agent-profile.ts`
- `contracts/src/agent.ts`：同步 schema

---

#### 2.6 打包链（可选，暂不做）

**若要分发 sqlite-vec**：
- 下载 `vec0.{dll,dylib,so}` 预编译二进制（~2MB）
- 放 `build-resources/sqlite-vec/`
- `打包工具` extraResources 打包
- 运行时 `db.loadExtension(vecPath)`

**现阶段**：文档说明用户手动安装扩展（开发者模式），或等后续 feature 分支统一打包。

---

### 三、补齐缺口（改动面：core + server + app）

#### 3.1 改/删工具（`core/tools`）

**新增** `memory-update.ts`：
```typescript
{
  name: 'memory_update',
  parameters: { id: string | number, content?: string, tags?: string[] },
  execute: async (_, {id, content, tags}) => {
    store.update(id, {content, tags});  // 新增 MemoryStore.update 方法
    return `Memory ${id} updated.`;
  }
}
```

**新增** `memory_delete.ts`：
```typescript
{
  name: 'memory_delete',
  parameters: { id: string | number },
  execute: async (_, {id}) => {
    store.delete(id);  // append {id, deleted:true, deletedAt} 到 JSONL（软删除）
    return `Memory ${id} deleted.`;
  }
}
```

**改动文件**：
- `store/memory.ts`：`update(id, partial)` / `delete(id)` 方法（~30 行）
- `tools/memory-{update,delete}.ts`（新增，各 ~30 行）
- `capabilities/memory/index.ts`：注册两个新工具
- `tool-attribution.ts`：`memory_update/delete` 归因（`{type:'memory', file:id}`）

**测试**：
- `memory.test.ts`：update/delete + 软删除过滤

---

#### 3.2 Server 路由（`server/routes`）

**新增** `GET /agents/:slug/memory`：
```typescript
// 返回 {entries: MemoryEntry[], total, mode}
const store = memoryStoreFor(agentId);
return {
  entries: store.filterEntries(query, {limit, sortBy}),
  total: store.entries.length,
  mode: profile.memory?.mode || 'simple'
};
```

**新增** `DELETE /agents/:slug/memory/:id`：
```typescript
store.delete(id);
return {ok: true};
```

**新增** `POST /agents/:slug/memory/rebuild-index`（若 mode=vector）：
```typescript
await store.rebuildVectorIndex();
return {ok: true, count};
```

**改动文件**：
- `server/src/routes/memory.ts`（新增，~80 行）
- `server/src/routes/index.ts`：注册路由
- `contracts/src/http.ts`：schema 定义（`GetMemoryResponse` / `DeleteMemoryRequest`）

**测试**：
- `server/__tests__/routes/memory.test.ts`（新增契约测试）

---

#### 3.3 前端 UI（`app/src`）

**新增** `pages/AgentMemoryView.tsx`：
- 左侧：agent selector（复用 `AgentList`）
- 右侧：memory 列表（虚拟滚动，`虚拟滚动库`）
  - 每行：content（前 100 字）、tags、created、操作（编辑/删除）
  - 顶部：搜索框 + 排序下拉 + 「重建索引」按钮（若 mode=vector）
  - 空状态：「此 agent 无记忆」

**新增** `components/MemoryEditDialog.tsx`：
- 双向绑定 content/tags
- 保存 → `PUT /agents/:slug/memory/:id`（需补 server 路由）

**改动文件**：
- `app/src/pages/AgentMemoryView.tsx`（新增，~150 行）
- `app/src/components/MemoryEditDialog.tsx`（新增，~80 行）
- `app/src/router.tsx`：注册 `/memory` 路由
- `app/src/sidebar.tsx`：加「记忆管理」入口

**测试**：
- 手动 E2E（desktop 启动后点击记忆管理，CRUD 操作）

---

#### 3.4 Rollback 覆盖（`core/capabilities/session`）

**现状**：`rollback_turn` 只回滚 data/card（`tool-attribution.ts:148-153` 跳过 memory）。

**改为**：
- `deriveSideEffects` 的 `memory_save/update/delete` 归因已有（§3.1）
- `rollback` 逻辑：读 turn 的 sideEffects，若有 `{type:'memory', file:id}`：
  - `save` → `delete(id)`
  - `update` → 恢复到 undo 快照（需在 `memory_update` 执行时记录 `undo: {content, tags}`）
  - `delete` → 恢复（软删除改回 `deleted:false`）

**改动文件**：
- `tool-attribution.ts`：`memory_update/delete` 归因加 `undo` 字段
- `capabilities/session/rollback.ts`（或相应文件）：`rollback` 分支加 `case 'memory'`
- `store/memory.ts`：`restore(id, snapshot)` 方法

**测试**：
- `rollback.test.ts`（或 session 测试）：memory save/update/delete 后 rollback

---

### 四、改动清单与风险

| 改动面 | 文件数 | LoC 估算 | 风险 |
|---|---|---|---|
| 零依赖增强 | 3（store/memory, tools/memory-recall, capabilities/memory） | ~100 | 低（纯逻辑，无依赖） |
| 向量模式接口 | 5（embedding/*, store/memory-vector, types/agent-profile） | ~250 | 中（sqlite-vec 扩展用户需手动安装） |
| 改/删工具 | 4（store, tools/*, capabilities, tool-attribution） | ~120 | 低 |
| Server 路由 | 3（routes/memory, routes/index, contracts） | ~150 | 低（标准 CRUD） |
| 前端 UI | 4（pages, components, router, sidebar） | ~250 | 中（新页面，E2E 验证） |
| Rollback 覆盖 | 3（tool-attribution, rollback, store/memory） | ~60 | 中（回滚逻辑敏感） |
| **总计** | **~20 文件** | **~930 行** | **中** |

**依赖引入**：
- 零（若只做零依赖增强 + 缺口）
- `sqlite-vec`（若做向量模式，用户手动安装或后续打包）
- embedding provider 暂不引入（接口抽象，后续补）

---

### 五、实施顺序建议

1. **Phase 1（低风险先行）**：零依赖增强 + 改/删工具（~220 行，1–2 天）
   - 验证：单测 + 手动 `memory_recall` 测排序
2. **Phase 2（UI 可见）**：Server 路由 + 前端 UI（~400 行，2–3 天）
   - 验证：桌面端打开记忆管理，CRUD 操作
3. **Phase 3（回滚补全）**：Rollback 覆盖（~60 行，1 天）
   - 验证：对话中 save/update → rollback → 检查 memory.jsonl
4. **Phase 4（可选高级）**：向量模式接口 + sqlite-vec 集成（~250 行，3–4 天）
   - 验证：开发者模式装 sqlite-vec 扩展，切换 `mode:vector`，测混合检索

**总工期**：Phase 1–3 约 **4–6 天**（核心缺口 + 零依赖增强）；Phase 4 可延后至 v1.3.x。

---

### 六、验证链

| 层 | 验证方式 |
|---|---|
| 单测 | `memory.test.ts`：排序/RRF/update/delete/rollback/vector-index |
| 契约 | `routes/memory.test.ts`：server CRUD 契约 |
| E2E | Desktop 启动 → 记忆管理 → 增删改查 → 对话中 recall 验证排序 → rollback 验证 |
| 向量模式 | 手动装 sqlite-vec → profile 改 `mode:vector` → rebuild → recall 对比 simple 模式 |

---

**问题或需澄清的**：
1. RRF 的 `k=60` 是否需要可配置？
2. 向量模式是否需要「自动检测扩展缺失并提示安装」的友好流程，还是开发者模式文档说明即可？
3. UI 记忆管理是否需要「批量删除」「导出 JSON」等高级操作？

以上即精准方案。若认可，可进入实施。

### 9.4 成本与顺序

- 总计 ~20 文件 ~930 行，中风险；依赖新增：无（Phase 1–3）或 sqlite-vec 用户侧安装（Phase 4）。
- 顺序：Phase 1 零依赖+改删工具（1–2 天）→ Phase 2 server+UI（2–3 天）→ Phase 3 rollback（1 天）→ Phase 4 向量模式（3–4 天，可延后 v1.3.x）。
- 验证：`memory.test.ts` + `routes/memory` 契约 + 桌面 E2E（CRUD/recall 排序/rollback）；向量模式需手动装扩展后对比 simple。

## 十、外部热门框架的长期、短期记忆写入方式（2026-10-10）

> 本节只记录「写」的机制（如何进入记忆），检索见 §二–§四。来源为框架官方文档与公开评测，未逐条实测。

### 10.1 长期写入（跨会话）

| 框架 | 写入入口与流程 | 关键取舍 |
|---|---|---|
| **抽取式记忆框架** | `add(messages, user_id)` → 查已有关联记忆（同 user/run 的历史作消歧上下文）→ 单遍 LLM 抽取 ADD-only 事实 → hash 去重 + embed → 实体链接 → 时间元数据（可异步后台补） | **ADD-only**：只增不改不删；矛盾靠「并存 + 检索期时序重排」解决，需显式 `update/delete` 或过期；`infer=False` 为原文直存模式 |
| **图编排记忆库** | 双通道：① 热路径——agent 用记忆读写工具在对话中显式读写；② 后台——后台记忆管理器 + `后台反思执行器`（可 debounce/延迟），按 namespace upsert/delete 并且保留版本历史 | `enable_inserts/updates/deletes` 三开关独立；Profiles（单文档覆写）vs Collections（插入/合并/删除）两种形态 |
| **图记忆框架** | `add_episode()` → 内容分块（按实体密度）→ 取最近 3 条历史作上下文 → 单遍抽取 节点+边 → 三级去重（精确/模糊/LLM）→ 矛盾边打 `invalid_at` + embeddings 落库 | 顺序版全功能；`add_episode_bulk` 为吞吐**跳过失效与日期抽取**（只适合初装/批量导入） |
| **OS 式分级记忆运行时** | Agent 自编辑 block：`memory_insert`（append，最安全）/ `memory_replace`（并发有竞态）/ `memory_rethink`（整块覆写）；`archival_memory_insert/search` 管冷存储；**睡眠期整理** 子 agent 在步数/压缩触发时后台整理 | Block 有 label/limit/只读开关；共享 block 多 agent 可见（concurrency 建议 append 优先） |
| **目录项目共性** | 项目 6（热度 + 睡眠整合 + 日历 rollup）、项目 7（append-only 事件 + 人工策展）、项目 1（捕获/夜间/周期 rollup + **审核队列**）、项目 3（提取/合并/撤回）、项目 4（MCP 写入 + diff 接受/回滚）、项目 2（置信度 + 冲突裁决） | 共同点：**写后整理**（睡眠/夜间/后台）+ **人审**（审核队列/策展/回滚）+ 软删除/失效而非硬删 |

### 10.2 短期写入（会话内 / 工作区）

| 模式 | 机制 | 代表 |
|---|---|---|
| 滚动窗口 | 保留最近 N 条，超限截断/触发摘要（通常 70% budget 处） | 某链式框架 `窗口记忆原语(k=5)` |
| 滚动摘要 | 最新 5 轮原文 + 更早的压缩成一条 summary；**切分必须落在 turn 边界**（否则 tool_use/tool_result 配对断裂）；先坍缩（clip/dedupe）再压摘要，`/compact` = N=0 | 某滚动摘要实现 / agent harness C / 编码 harness A compaction |
| 便签/计划 | agent 每步把目标、计划、中间结论写回 prompt 固定位置（Thought/Action/Observation、TODO 块） | ReAct、编码 harness A TODO、某 agent 编辑器 |
| Spherse 现有对应 | session event log（append-only 审计真相）+ fold（紧凑工作视图）+ `maybePreCompact`（0.75×window 预压）+ `<compaction-digest>` 落 user 消息 | `session/event-log.ts`、`fold.ts`、compaction capability |

### 10.3 写入原则（跨框架共识，可直接指导 §九）

1. **写要有过滤**：无差别的全量写入必然污染召回（重要性/选择性是第一原则）。
2. **新增与更新分离**：要么 ADD-only + 时序失效（抽取式记忆框架/图记忆框架），要么显式 upsert/delete 开关（图编排记忆库）；**不要静默覆写**。
3. **非关键写异步化**：后台/睡眠期整理（OS 式分级记忆运行时的睡眠整理、图编排记忆库 后台反思、夜间 rollup），热路径只留显式保存。
4. **切分保护配对**：摘要/截断落在 turn 边界；`tool_use` 必须有 `tool_result`。
5. **工作区与长期记忆显式交接**：会话开始从长期记忆取，结束把值得留的写回去；两层各司其职、不混用。

## 十一、热门 Harness 的记忆 / 压缩机制（2026-10-10）

> 对象：主流 Agent harness（编码 harness A / 编码 harness B / agent harness C）与记忆评测 harness。来源为官方文档与公开源码分析，未逐条实测。

### 11.1 编码 harness A（官方）

- **七层记忆**：① `根指令文件`（指令，常驻）；② 自动记忆（`根记忆文件` 前 200 行/25KB，每 session 注入）；③ 后台抽取（background extraction agent）；④ Session Memory（当前会话结构化笔记）；⑤ Agent Memory（特定 Agent）；⑥ 相关记忆（异步预取 + Attachment 注入，会话级去重）；⑦ 空闲巩固。
- **compaction**：对话替换为摘要 + **从盘重注**（root `根指令文件`、自动记忆、skill 5000/个·25000 共计、重读 top-5 文件）；`/compact` 可带 focus；自动压缩 约 95% 容量；`/clear` 重置；hooks 的 `会话启动钩子` 在 compact 时触发（等价于一次 session 重启）。
- 对 Spherse 的含义：compaction digest ≈ 其摘要替换；缺的是「**压缩后从盘重注**」（Spherse 的固定块只在装配时读一次）与 `/memory`、`/context` 这类用量/载入可视化。

### 11.2 编码 harness B / agent harness C

- **编码 harness B**：truncation service——工具全量结果落盘，只回片段 + pointer（与 Spherse `tool-output-budget` 同构，但多了「可按 pointer 取回」）。
- **agent harness C**：`上下文压缩器`（threshold / 尾部模式 / protect 首尾 N 条 / aux 摘要模型）；**就地压缩同一 session** vs rotation（父会话 id 链）；compression lock 防并发；memory providers 在边界收 会话切换钩子 通知。
- 对 Spherse 的含义：turn 边界保护、压缩锁、就地 vs rotation 的取舍，可直接对照 compaction 域。

### 11.3 记忆评测 harness

- **某记忆评测基准**：同一模型 + 同一裁判跑 抽取式记忆框架/图编排记忆库/图向量 ECL 平台/图记忆框架/OS 式分级记忆运行时，对抗 oracle（证据全给）/ window（32k）/ file（日期文件 + grep，最多 8 次工具）三基线；指标含 tokens/answer、遗忘曲线、**被取代值仍被返回率**。结论：记忆产品省 10–50× token 但低一题；**file search 没被超过**。
- **某长时记忆评测集**：oracle/S/M 三档、500 题、6 题型、二值裁判；某长时记忆评测集 V2 规定 `memory_modules` 接口（`insert(trajectory)` / `query` 返回证据）+ 某评测指标。
- 对 Spherse 的含义：若将来评测记忆，抄 某记忆评测基准 的「同模型同裁判 + 三基线 + token/遗忘/取代值」框架即可，无需自创。

## 十二、范围与不做

- 本调研不修改 `docs/dev/backlog.md`、不新增 backlog 条目；不产出 design/plan；不改 `docs/official/`。
- 外部框架与目录信息来自公开网页（2026 年资料），未逐条实测与核代码。

## 十三、记忆写入核心选型决策

> 依据 §十（框架写入机制）与 §十一（Harness 写入/交接机制）修正；与 §九 存储/检索设计配套。

### 核心写入原则（跨框架共识，08 §10.3）

1. **写要有过滤**：无差别全量写入必然污染召回，重要性/选择性是第一原则
2. **新增与更新分离**：ADD-only + 时序失效（抽取式记忆框架/图记忆框架）或显式 upsert/delete 开关（图编排记忆库），**不要静默覆写**
3. **非关键写异步化**：后台/睡眠期整理（OS 式分级记忆运行时的睡眠整理、图编排记忆库 后台反思、夜间 rollup），热路径只留显式保存
4. **切分保护配对**：摘要/截断落在 turn 边界，`tool_use` 必须有 `tool_result`
5. **工作区与长期记忆显式交接**：会话开始从长期记忆取，结束把值得留的写回去，两层各司其职

---



### 一、当前写入路径（08 §9.0 事实盘点）

| 写入者 | 路径 | 说明 |
|---|---|---|
| **agent（官方入口）** | `memory_save` → `MemoryStore.save` → `appendFile` | 唯一经归因的写入 |
| **agent（旁路）** | `write_file` / `edit_file` 直写 `memory.jsonl` | `MEMORY_PATH_RULE` 允许 LLM 读写，绕开工具与归因 |
| **人/开发者** | 运行时外直接改文件 | 无审计 |
| **系统自动写入** | **无** | compaction/trigger/事件管线均不写 |

**结论**：写入只有 agent（工具或直写）+ 人，**无系统自动行为**——这符合「热路径只留显式保存」原则，但存在旁路收口问题。

---

### 二、写入选型建议（写入分层）

> **修正（§11.2）**：原方案只给 nightly cron 巩固，漏掉「会话切换边界交接」这一更廉价、更贴合 §10.3.5 的入口。agent harness C 的 memory provider 在 会话切换钩子 边界收/放记忆，应作为主机制，cron 降为补充。

**写入分层**：
- **A. 热路径（显式，已有）**：`memory_save/update/delete`，对话中 agent 显式写。
- **B. 会话边界交接（新增，主机制）**：会话结束/切换时（对齐 agent harness C 会话切换钩子、§10.3.5「结束把值得留的写回去」），旁路读本会话轨迹，把「值得留的」经 `memory_save` 写回；主对话不直接写记忆。
- **C. 后台巩固（补充）**：trigger（cron）+ 独立 consolidator 会话，读近段轨迹做合并/失效/提取模式；**不是唯一写入机制**。

**摄入接口（修正，§11.3）**：`memory_save(content)` 只吃原子事实；某长时记忆评测集 V2 `insert(trajectory)`、抽取式记忆框架 `add(messages)`、图记忆框架 `add_episode()` 都吃**对话轨迹**。会话边界交接与后台巩固统一走 `ingest(trajectory)`，原子 `memory_save` 保留为便捷路径。

#### **2.1 显式写入（热路径，已有）**

**机制**：`memory_save(content, tags?)` → append-only JSONL

**对标**：抽取式记忆框架 的 `add()`、图编排记忆库 的 记忆管理工具、OS 式分级记忆运行时 的 `memory_insert`

**现状评估**：✅ 已满足最小需求，但缺：
- **改/删工具**：目录项目共识强调「可撤回/回滚」（项目 3、项目 4、项目 2），现在只有增
- **重要性过滤**：抽取式记忆框架 的 `infer=False` 为原文直存，OS 式分级记忆运行时 的 block 有 label/limit——Spherse 没有「这条够不够重要」的门槛
- **去重**：图记忆框架 三级去重（精确/模糊/LLM），抽取式记忆框架 hash 去重——Spherse 允许重复写入

**补齐方向**：
1. **新增工具**：`memory_update(id, content?, tags?)`、`memory_delete(id)` → 软删除（append `{deleted:true}`）
2. **可选去重**：`memory_save` 加参数 `{dedupe?: 'exact'|'fuzzy'|'none'}`（默认 none，保持现状）
   - `exact`：content 精确匹配已有条目 → 跳过或返回已有 id
   - `fuzzy`：余弦相似度 >0.95（需 embedding，Phase 3）
3. **重要性评分**（可选，不强制）：agent profile 加 `memory.importanceThreshold: number`（0-10），`memory_save` 加可选 `importance` 参数，低于阈值拒绝

---

#### **2.2 后台巩固（补充，非唯一写入机制）**

**机制**：trigger（cron）+ 独立 agent 会话 + 「整理记忆」系统 prompt；消费 `ingest(trajectory)` 摄入的轨迹

**对标**：
- OS 式分级记忆运行时 的 **睡眠期整理**（旁路 worker 异步改写）
- 项目 6 的 睡眠整合
- 项目 1 的夜间抽取 + 审核队列
- 项目 7 的人工策展

**Spherse 落地方式**：
```yaml
# .spherse/triggers/memory-consolidate.yaml
type: cron
schedule: "0 2 * * *"  # 每天凌晨 2 点
agentId: memory-consolidator  # 专用 agent
action:
  type: run_prompt
  prompt: |
    读取最近 7 天的 session event logs（非 memory.jsonl），
    按以下规则巩固记忆：
    1. 合并重复事实（用 memory_update 更新已有条目的 hitCount/lastSeen）
    2. 失效过时事实（用 memory_delete 软删除）
    3. 提取高频模式（如「用户每周五晚提到 X」）为新记忆
    4. 输出巩固报告到 memory-consolidation.log
```

**关键设计**：
- **读源**：session event logs（`sessions/{id}/events.jsonl`），**不是** memory.jsonl（避免自我强化循环）
- **写目标**：memory.jsonl（调用 `memory_update/delete/save` 工具）
- **人工审核**（可选）：输出「待审核队列」到 UI（参考 项目 1 / 项目 2），人决定是否应用

**优先级**：v1.3.x（非紧急，Phase 1-2.2 已足够）

---

#### **2.3 旁路收口（安全加固）**

**问题**：agent 可通过 `write_file` / `edit_file` 直写 `memory.jsonl`，绕过工具与归因。**决策：禁止直写**（`MEMORY_PATH_RULE` 改 `llmRead/Write=false`，见 §四）。

---

### 三、存储语义、并发与完整写入架构

**修正（§11.2 / §11.3）**：原方案未定义「同 id 多行」读语义，也无并发保护，补齐：

- **读语义（写死）**：JSONL append-only，一个 `id` 可有多行；读取时按 `id` 归并取**最新行**，`deleted=true` / 被取代（superseded）版本**永不返回**——即 某记忆评测基准 指标「被取代值仍被返回率」要压到 0（§11.3）。
- **并发锁**：`MemoryStore` 写入走**单写者锁**（save/update/delete/ingest 与后台巩固互斥），对齐 agent harness C `compression lock`（§11.2），防热路径与后台巩固交错写。
- **时态字段（预留）**：为「当时为真」查询，行可带 `valid_at/invalid_at/source_event_id`（§三 图记忆框架 模式）；Phase 1 先只做软删除。

**完整写入架构**：

```
┌─────────────────────────────────────────────────────────┐
│ 热路径（对话中，实时）                                      │
├─────────────────────────────────────────────────────────┤
│ memory_save(content, tags?, importance?, dedupe?)       │
│   → 重要性过滤（可选）                                      │
│   → 去重检查（exact/fuzzy/none）                           │
│   → MemoryStore.save()【单写者锁】→ append memory.jsonl  │
│   → 归因 {type:'memory', operation:'save', id}          │
│                                                         │
│ memory_update(id, content?, tags?)                      │
│   → MemoryStore.update()【单写者锁】→ append 更新行      │
│   → 归因 {type:'memory', operation:'update', id, undo}  │
│                                                         │
│ memory_delete(id)                                       │
│   → MemoryStore.delete()【单写者锁】→ append {deleted:true}│
│   → 归因 {type:'memory', operation:'delete', id, undo}  │
└─────────────────────────────────────────────────────────┘
                      ↓ 单一真相源
┌─────────────────────────────────────────────────────────┐
│ 存储层（append-only JSONL）                              │
├─────────────────────────────────────────────────────────┤
│ .spherse/agents/{slug}/memory.jsonl                     │
│   - 每行一个 MemoryEntry                                  │
│   - 软删除：{id, deleted:true, deletedAt}                │
│   - 更新：append 新行（同 id，更新 content/tags/hitCount）│
│   - 读取：过滤 deleted=true，superseded 永不返回（按 id 取最新）│
└─────────────────────────────────────────────────────────┘
                      ↓ 派生索引（可选）
┌─────────────────────────────────────────────────────────┐
│ 检索层（Phase 3 向量模式）                                 │
├─────────────────────────────────────────────────────────┤
│ .spherse/agents/{slug}/memory.vec.db (sqlite-vec)       │
│   - 随 save/update/delete 同步写                         │
│   - 可整体 rebuild                                        │
└─────────────────────────────────────────────────────────┘
                      ↑ 会话边界交接
┌─────────────────────────────────────────────────────────┐
│ 会话边界交接（新增，主机制；§11.2 会话切换钩子）      │
├─────────────────────────────────────────────────────────┤
│ 会话结束/切换 → ingest(trajectory) → 经 memory_save 写回  │
│   「值得留的」条目（主对话不直接写）                        │
└─────────────────────────────────────────────────────────┘
                      ↑ 冷路径
┌─────────────────────────────────────────────────────────┐
│ 后台巩固（补充，定时；§11.1 空闲巩固 / OS 式分级记忆运行时的睡眠整理）  │
├─────────────────────────────────────────────────────────┤
│ trigger: memory-consolidator agent (cron: daily 2am)    │
│   - 读源：session event logs（最近 7 天）                  │
│   - 写目标：memory.jsonl（调 memory_* 工具）              │
│   - 操作：合并重复、失效过时、提取模式                       │
│   - 可选：输出待审核队列到 UI                               │
└─────────────────────────────────────────────────────────┘
                      ↓ 回滚
┌─────────────────────────────────────────────────────────┐
│ 归因与回滚（事务安全）                                      │
├─────────────────────────────────────────────────────────┤
│ rollback_turn:                                          │
│   - save → delete(id)                                   │
│   - update → restore(id, undo)                          │
│   - delete → restore(id, undo)                          │
└─────────────────────────────────────────────────────────┘
```

---

### 四、权限加固（禁止直写）

#### 4.1 修改 `MEMORY_PATH_RULE`（`core/src/access/path-rules.ts`）

**现状**（08 §七）：
```typescript
{
  rule: 'memory',
  patterns: ['agents/*/memory.jsonl'],
  llmRead: true,
  llmWrite: true,   // ← 允许 LLM 直写
  serverRead: true,
  serverWrite: false
}
```

**改为**：
```typescript
{
  rule: 'memory',
  patterns: ['agents/*/memory.jsonl'],
  llmRead: false,    // ← 禁止 LLM 直读（避免绕过 filterEntries 过滤 deleted=true）
  llmWrite: false,   // ← 禁止 LLM 直写（强制走工具）
  serverRead: true,
  serverWrite: false
}
```

**影响**：
- ✅ `memory_save/recall/update/delete` 工具仍可用（工具实现直接调 `MemoryStore`，不走 path 规则）
- ✅ 归因覆盖全部写入
- ✅ Rollback 可靠
- ⚠️ 高级用户无法直接编辑 memory.jsonl（需通过 UI 或 server API）

**缓解**：UI 记忆管理页提供完整 CRUD + 导入/导出

---

#### 4.2 测试更新（`__tests__/access/path-rules.test.ts`）

更新预期：
```typescript
// 原：memory.jsonl LLM 可读可写
expect(evaluatePath('agents/foo/memory.jsonl', 'llm', 'read')).toBe(true);
expect(evaluatePath('agents/foo/memory.jsonl', 'llm', 'write')).toBe(true);

// 改为：LLM 不可读写
expect(evaluatePath('agents/foo/memory.jsonl', 'llm', 'read')).toBe(false);
expect(evaluatePath('agents/foo/memory.jsonl', 'llm', 'write')).toBe(false);

// server 保持只读
expect(evaluatePath('agents/foo/memory.jsonl', 'server', 'read')).toBe(true);
expect(evaluatePath('agents/foo/memory.jsonl', 'server', 'write')).toBe(false);
```

---

### 五、写入参数扩展（可选增强）

#### 5.1 去重（`memory_save`）

```typescript
// tools/memory-save.ts
parameters: z.object({
  content: z.string(),
  tags: z.array(z.string()).optional(),
  importance: z.number().min(0).max(10).optional(),  // 重要性评分
  dedupe: z.enum(['exact', 'fuzzy', 'none']).default('none')
})

execute: async (ctx, {content, tags, importance, dedupe}) => {
  // 重要性过滤
  const threshold = ctx.agent.profile.memory?.importanceThreshold ?? 0;
  if (importance !== undefined && importance < threshold) {
    return `Memory importance ${importance} below threshold ${threshold}, not saved.`;
  }

  // 去重检查
  if (dedupe === 'exact') {
    const existing = ctx.memoryStore.findByContent(content);  // 精确匹配
    if (existing) return `Duplicate memory, existing id: ${existing.id}`;
  }
  // fuzzy 需 embedding，Phase 3

  const id = ctx.memoryStore.save({content, tags});
  return `Memory saved with id: ${id}`;
}
```

#### 5.2 Profile 配置（`types/agent-profile.ts`）

```typescript
memory?: {
  mode?: 'simple' | 'vector';
  injection?: {...};
  embeddingProvider?: string;
  importanceThreshold?: number;  // 0-10，默认 0（全部接受）
}
```

---

### 六、实施清单（写入部分）

| 改动 | 文件 | LoC | 优先级 |
|---|---|---|---|
| **权限加固** | `access/path-rules.ts` + 测试 | ~10 | **P0**（Phase 1） |
| **改/删工具** | `tools/memory-{update,delete}.ts` | ~60 | **P0**（Phase 1） |
| **Store 方法** | `store/memory.ts`: `update/delete/restore` | ~40 | **P0**（Phase 1） |
| **归因扩展** | `tool-attribution.ts` | ~20 | **P0**（Phase 1） |
| **Rollback 覆盖** | `capabilities/session/rollback.ts` | ~30 | **P1**（Phase 2.2） |
| **去重 exact** | `tools/memory-save.ts` + Store | ~30 | **P2**（可选） |
| **重要性过滤** | `tools/memory-save.ts` + Profile | ~20 | **P2**（可选） |
| **会话边界交接** | session 结束钩子 + `ingest(trajectory)` | ~40 | **P1**（v1.2.x） |
| **单写者锁** | `store/memory.ts` 写路径互斥 | ~20 | **P0**（Phase 1） |
| **后台巩固** | trigger yaml + consolidator agent | ~100 | **P3**（v1.3.x） |

---

### 七、验证方式

#### 7.1 权限加固验证
```
1. 对话中尝试 write_file('.spherse/agents/foo/memory.jsonl', '...')
   → 预期：权限拒绝（llmWrite=false）
2. 对话中调用 memory_save('test')
   → 预期：成功（工具绕过 path 规则）
3. UI 记忆管理页编辑/删除
   → 预期：成功（server 通过 MemoryStore 操作）
```

#### 7.2 归因与回滚验证
```
1. 对话中 memory_save('foo') → 记录 turn A
2. rollback_turn(A)
3. 检查 memory.jsonl → 预期：该条记忆 deleted=true
4. memory_recall('foo') → 预期：未找到
```

#### 7.3 读语义与并发验证
```
1. 同一 id update 两次 → recall/list 只返回最新行
2. delete 后 list/recall 不含该条（superseded 返回率 = 0）
3. 并发 save + 后台巩固 → JSONL 无交错损坏（锁生效）
```

#### 7.4 去重验证（若实施 P2）
```
1. memory_save('user likes coffee', dedupe='exact')
2. memory_save('user likes coffee', dedupe='exact')
   → 预期：返回 "Duplicate memory, existing id: xxx"
```

---

### 最终建议

**立即实施（Phase 1）**
1. 权限加固：`MEMORY_PATH_RULE` 改 `llmRead/Write=false`（禁止直写/直读，收口旁路）
2. 改/删工具：`memory_update/delete` + Store 方法（含读语义、单写者锁）
3. 归因扩展：update/delete 归因带 undo

**短期补齐（Phase 2.2）**
1. Rollback 覆盖：读 sideEffects 回滚 memory 操作
2. 会话边界交接：会话切换钩子 + `ingest(trajectory)`（写入主机制）

**可选增强（评估后决定）**
1. 去重 `exact`：`memory_save` 加 `dedupe`
2. 重要性过滤：`importance` + `importanceThreshold`

**延后高级（v1.3.x）**
1. 后台巩固：trigger + consolidator agent
2. 去重 `fuzzy`：需 embedding，随向量模式

## 十四、记忆增强核心选型决策

> 依据 §十一（Harness 记忆/压缩机制）修正；与 §十三 写入决策、§九 设计配套。


### 1. 不引入外部框架
- **理由**：主流框架（抽取式记忆框架/图记忆框架/OS 式分级记忆运行时/图向量 ECL 平台）均为 Python + 外部数据库，与 Spherse「TS 单体 + 本地优先 + SQLite」架构不兼容
- **替代**：吸收架构模式，自研实现

### 2. 三线并行方案

#### **Phase 1: 零依赖增强**（优先级最高，1-2 天）
**目标**：提升现有 `memory.jsonl` 检索质量，无新依赖

**改动点**：
1. **`filterEntries` 增强**（`store/memory.ts`）
   - 新增参数：`limit`（默认 20）、`sortBy`（recency/frequency/relevance）、`tagBoost`（默认 2.0）
   - 排序逻辑：
     - `recency`：按 `created` 降序
     - `frequency`：按命中次数。**修正**：`hitCount` 必须**持久化**（append 新行或从 session event log 派生），不用内存计数——否则重启即丢，frequency 跨会话失效。
     - `relevance`：`(contentHits + tagHits × tagBoost) × timeDecay`，`timeDecay = 1/(1 + daysSince/30)`
   - 返回 top-N，避免注入爆炸
   - **读语义**与 §十三 一致：按 `id` 取最新、`deleted/superseded` 不返回

2. **注入策略可配置**（`capabilities/memory/index.ts`）
   - Profile 加 `memory.injection: {strategy, limit}`
   - 策略：`recent`（现状）/ `relevant`（基于当前 turn 关键词）/ `none`（按需 recall）
   - **修正（§11.1 layer 6）**：`relevant` 策略需**会话级去重**（维护本会话已注入 id 集合，命中即跳过），避免同一记忆逐轮重复注入

3. **注入时机：装配时 + compaction 后重注**（新增，最高价值修正）
   - **问题（§11.1）**：Spherse 的 `<memory>` 块只在装配时读一次，compaction 后丢失；编码 harness A 是「摘要替换 + **从盘重注**」。
   - **改法**：在 compaction capability 完成后**重注 `<memory>`**（重读 `memory.jsonl` 头部/最近条目），对齐 编码 harness A `会话启动钩子` 在 compact 触发重注。
   - 改动：`capabilities/compaction/*` 挂重注钩子；`capabilities/memory` 暴露 `buildMemoryBlock()` 供复用。

4. **新增改/删工具**（`tools/memory-{update,delete}.ts`）
   - `memory_update(id, content?, tags?)`：需 `MemoryStore.update` 方法
   - `memory_delete(id)`：软删除（append `{deleted:true}`）
   - 归因：`{type:'memory', operation, id, undo:{content,tags}}`

**验证**：单测（排序/衰减/tag 权重/hitCount 持久化/会话去重）+ compaction 后 `<memory>` 仍在 + 手动 recall

---

#### **Phase 2: 向量模式接口**（可选，建议延后 v1.3.x）

> **修正（§11.3，评估先行）**：某记忆评测基准 结论「**file search 未被超过**」。上向量前必须先按 某记忆评测基准 框架跑「同模型同裁判 + oracle/window/**file** 三基线」；**file 基线未被超过则不上向量**，避免为跑分/跟风加复杂度。

**目标**：手动切换向量检索，JSONL 唯一真相源

**架构约束**（满足三条件，避免双份真相）：
1. **互斥开关**：`profile.memory.mode: 'simple'|'vector'`（默认 simple）
2. **单一真相**：`.spherse/agents/{slug}/memory.vec.db`（sqlite-vec）为 `memory.jsonl` 的**派生缓存**
3. **API 不变**：`memory_save/recall` 签名不变，只换 `filterEntries` 实现

**关键组件**：
1. **Embedding 接口抽象**（`core/embedding/{types,registry}.ts`）
   ```typescript
   interface EmbeddingProvider {
     name: string;
     embed(texts: string[]): Promise<number[][]>;
   }
   ```
   - 暂不实现具体 provider（本地 embedding 库/云端 embedding 服务），只留注册口
   - 内置 `NULL_PROVIDER`（报错提示）

2. **向量索引管理**（`store/memory-vector.ts`）
   ```typescript
   class MemoryVectorIndex {
     rebuild(entries): void;  // 批量 embed + 写入 vec 表
     add(entry): void;        // 单条增量
     search(query, limit): string[];  // 返回 entry.id 数组
   }
   ```
   - 使用 `sqlite-vec` 的 `vec0` 虚拟表
   - 懒加载：若 `mode=vector` 时扩展缺失则报错提示

3. **混合检索 + RRF**（`store/memory.ts`）
   ```typescript
   filterEntries(query, opts) {
     if (!vectorIndex) return 原逻辑;
     const vecIds = vectorIndex.search(query, limit*2);
     const keywordIds = filterBySubstring(query, limit*2);
     return RRF([vecIds, keywordIds], limit);  // Σ 1/(60+rank)
   }
   ```

**依赖**：`sqlite-vec` 扩展（用户手动安装，或后续打包 2MB 预编译二进制至 `build-resources/`）

---

#### **Phase 3: 补齐缺口**（~430 行，3-4 天）

1. **Server 路由**（`server/routes/memory.ts`）
   - `GET /agents/:slug/memory`：返回 `{entries, total, mode}`
   - `DELETE /agents/:slug/memory/:id`
   - `POST /agents/:slug/memory/rebuild-index`（若 mode=vector）
   - 契约：`contracts/src/http.ts` 加 schema

2. **前端 UI**（`app/src/pages/AgentMemoryView.tsx`）
   - 左侧：agent selector
   - 右侧：虚拟滚动列表（content 前 100 字、tags、created、操作）
   - 顶部：搜索 + 排序 + 「重建索引」按钮
   - 对话框：`MemoryEditDialog.tsx`（编辑 content/tags）
   - 路由：`/memory`，sidebar 加入口

3. **Rollback 覆盖**（`capabilities/session/rollback.ts`）
   - 现状：跳过 memory
   - 改为：读 turn 的 `sideEffects`，按归因回滚：
     - `save` → `delete(id)`
     - `update` → 恢复 undo 快照
     - `delete` → 恢复（`deleted:false`）
   - 需 `MemoryStore.restore(id, snapshot)` 方法

4. **`memory_recall` 大结果 pointer 化**（修正，§11.2）
   - 参照 编码 harness B truncation：recall 结果超阈值时只注入片段 + `id`（pointer），全文按需取回；避免单条大记忆撑爆上下文。

--- 

### 吸收的三条架构模式

1. **双时态事实**（图记忆框架）：事实表加 `valid_at/invalid_at/source_event_id`，矛盾失效而非删除（支持「现在/当时为真」查询）
   - 落地：软删除机制 + 未来可扩展时态字段

2. **混合检索 + RRF**（抽取式记忆框架 v2）：向量 + BM25 + trigram 各取 top-N，按 `Σ 1/(60+rank)` 融合
   - 落地：Phase 2 向量模式的 `filterEntries` 实现

3. **休眠期巩固**（OS 式分级记忆运行时）：主对话不写记忆，旁路 worker 异步改写
   - 落地：未来用 trigger（cron）+ 独立会话实现

---

### 实施顺序建议

| Phase | 内容 | 工期 | 风险 | 版本 |
|---|---|---|---|---|
| **Phase 1** | 零依赖增强 + 改/删工具 | 1-2 天 | 低 | v1.2.x |
| **Phase 2.1** | Server 路由 + 前端 UI | 2-3 天 | 中 | v1.2.x |
| **Phase 2.2** | Rollback 覆盖 | 1 天 | 中 | v1.2.x |
| **Phase 3** | 向量模式接口 + sqlite-vec | 3-4 天 | 中 | v1.3.x（可选） |

**总计**：Phase 1-2.2 约 **4-6 天**（核心缺口），Phase 3 可延后

---

### 验证链

- **单测**：`memory.test.ts`（排序/RRF/update/delete/rollback/vector-index/hitCount 持久化/会话去重）
- **契约**：`routes/memory.test.ts`（server CRUD）
- **E2E**：Desktop → 记忆管理 → CRUD → 对话 recall 验证排序 → rollback 验证
- **compaction**：触发压缩后确认 `<memory>` 已重注（§11.1）
- **向量模式**：**先跑 某记忆评测基准 file 基线**，未被超过则不上向量；若上，手动装 sqlite-vec → profile 改 `mode:vector` → rebuild → 对比 simple

---
### 附：Phase 1-2.2 详细改动清单（按依赖序）

#### 1. Core 层（~400 行）

**1.1 Schema 扩展**（`types/agent-profile.ts`）
```typescript
memory?: {
  mode?: 'simple' | 'vector';  // 默认 simple
  injection?: {
    strategy?: 'recent' | 'relevant' | 'none';  // 默认 recent
    limit?: number;  // 默认 20
  };
  embeddingProvider?: string;  // 若 mode=vector
}
```

**1.2 Store 增强**（`store/memory.ts`）
- `MemoryEntry` 加字段：`hitCount?: number`、`deleted?: boolean`、`deletedAt?: string`
- 新方法：
  - `update(id, partial: {content?, tags?}): void` → append 更新行
  - `delete(id): void` → append `{id, deleted:true, deletedAt}`
  - `restore(id, snapshot): void` → rollback 用
- `filterEntries` 增强：
  - 过滤 `deleted=true`
  - 新参数：`{limit=20, sortBy='recency', tagBoost=2.0}`
  - 三种排序实现（recency/frequency/relevance）
  - 命中时 `hitCount +1`；**修正：持久化**（append 新行），不用内存计数

**1.3 Tools 新增**（`tools/memory-{update,delete}.ts`）
- `memory_update`：schema `{id, content?, tags?}`，调 `store.update`
- `memory_delete`：schema `{id}`，调 `store.delete`

**1.4 Capability 调整**（`capabilities/memory/index.ts`）
- 注册 `memory_update/delete` 工具
- `buildContextBlocks`：
  - 读 `profile.memory.injection`
  - `relevant` 策略：从当前 turn user 消息提取关键词（简单 split + stopwords 过滤），调 `filterEntries(keywords, {sortBy:'relevance'})`；**加会话级去重**（本会话已注入 id 跳过）
  - 保留 `<memory>` 块结构不变
- **compaction 后重注（新增，§11.1）**：compaction 完成后重注 `<memory>`（暴露 `buildMemoryBlock()` 供 compaction capability 复用），对齐 编码 harness A「摘要替换 + 从盘重注」

**1.5 归因与 Rollback**（`tool-attribution.ts` + `capabilities/session/rollback.ts`）
- `deriveSideEffects`：
  - `memory_update` → `{type:'memory', operation:'update', id, undo:{content,tags}}`
  - `memory_delete` → `{type:'memory', operation:'delete', id, undo:{content,tags,deleted}}`
- `rollback` 分支加 `case 'memory'`：
  - `save` → `store.delete(id)`
  - `update` → `store.restore(id, undo)`
  - `delete` → `store.restore(id, undo)`

**测试**：`__tests__/capabilities/memory.test.ts` 扩展（~150 行新增用例）

---

#### 2. Contracts 层（~80 行）

**`contracts/src/http.ts`** 新增：
```typescript
GetMemoryRequest: {agentId, query?, limit?, sortBy?}
GetMemoryResponse: {entries: MemoryEntry[], total, mode}
DeleteMemoryRequest: {agentId, id}
UpdateMemoryRequest: {agentId, id, content?, tags?}
RebuildIndexRequest: {agentId}  // 预留向量模式
ImportMemoryRequest: {agentId, entries: MemoryEntry[]}
ExportMemoryResponse: {entries: MemoryEntry[], exportedAt}
```

**`contracts/src/websocket.ts`**：
- 已有 `sideEffectRef: {type:'memory'}`，无需改动

---

#### 3. Server 层（~150 行）

**`server/src/routes/memory.ts`**（新增）：
```typescript
GET    /agents/:slug/memory           // 列表 + 搜索
DELETE /agents/:slug/memory/:id       // 删除
PUT    /agents/:slug/memory/:id       // 更新
POST   /agents/:slug/memory/import    // 批量导入
GET    /agents/:slug/memory/export    // 导出 JSON
POST   /agents/:slug/memory/rebuild   // 重建索引（预留）
```

**实现要点**：
- 从 `ServerContext` 获取对应 agent 的 `MemoryStore`
- 校验 agentId 存在性（404）
- 导出：`res.setHeader('Content-Disposition', 'attachment; filename=memory-{slug}-{timestamp}.json')`
- 导入：schema 校验 + 逐条 `store.save`（跳过重复 id）

**测试**：`server/__tests__/routes/memory.test.ts`（契约测试，~80 行）

---

#### 4. App 层（~280 行）

**4.1 页面**（`app/src/pages/AgentMemoryView.tsx`）
- 布局：左侧 agent selector（复用 `AgentList`），右侧记忆列表
- 顶部操作栏：
  - 搜索框（实时 debounce 300ms）
  - 排序下拉（Recency/Frequency/Relevance）
  - 按钮组：「导出 JSON」「导入 JSON」「批量删除」「重建索引」（向量模式时显示）
- 列表：
  - 虚拟滚动（`虚拟滚动库`，每行高度 80px）
  - 每行：content 前 100 字、tags（pill 样式）、created（相对时间）、操作（编辑/删除 icon）
  - 批量选择：checkbox（多选状态下显示「删除选中 N 项」）
- 空状态：「此 agent 无记忆，在对话中使用 memory_save 创建」

**4.2 对话框**（`app/src/components/MemoryEditDialog.tsx`）
- 表单：content（textarea）、tags（逗号分隔输入 + 实时 chip 预览）
- 保存 → `PUT /agents/:slug/memory/:id`
- 关闭前未保存提示

**4.3 路由与导航**
- `app/src/router.tsx`：注册 `/memory` → `AgentMemoryView`
- `app/src/sidebar.tsx`：「记忆管理」入口（icon：脑/档案）

**4.4 SDK 预留**（不做可视化统计）
- 暂不做图表，但 export API 已返回全量数据，未来可接 `recharts`

**测试**：手动 E2E（desktop 启动后点击记忆管理，CRUD 操作）

---

### 二、向量模式打包（Phase 3 预留设计）

**打包策略**：打包工具 extraResources

**步骤**：
1. 从 `sqlite-vec` 官方 releases 下载预编译二进制：
   - `vec0.dll`（Windows x64）
   - `vec0.dylib`（macOS arm64/x64 universal）
   - `vec0.so`（Linux x64）
2. 放置 `build-resources/sqlite-vec/{platform}/`
3. `打包工具` 配置：
   ```json
   "extraResources": [{
     "from": "build-resources/sqlite-vec/${os}/${arch}/",
     "to": "sqlite-vec"
   }]
   ```
4. 运行时加载：
   ```typescript
   const vecPath = path.join(process.resourcesPath, 'sqlite-vec', `vec0.${ext}`);
   db.loadExtension(vecPath);
   ```

**降级**：若扩展加载失败且 `mode=vector`，报错提示用户切回 `mode=simple`

---

### 三、批量操作细节

**批量删除**：
- 前端：选中多个 checkbox → 「删除选中 N 项」按钮
- 后端：复用 `DELETE /memory/:id`，前端循环调用（可选优化：`POST /memory/batch-delete {ids: string[]}`）

**导入 JSON**：
- schema 校验：`{entries: MemoryEntry[]}`
- 去重策略：
  - 若 `id` 已存在 → 跳过（提示「已跳过 N 条重复」）
  - 可选开关：「覆盖已有」（把已存在的先软删除）
- 导入后自动重建索引（若向量模式）

---

### 四、实施检查清单

#### Phase 1（零依赖增强，1-2 天）
- [ ] `store/memory.ts`：filterEntries 增强 + update/delete/restore 方法
- [ ] `store/memory.ts`：单写者锁 + 读语义（按 id 取最新、superseded 不返回）
- [ ] `tools/memory-{update,delete}.ts`：新增工具
- [ ] `capabilities/memory/index.ts`：注册工具 + 注入策略 + 会话级去重
- [ ] `capabilities/compaction`：compaction 后重注 `<memory>`（§11.1）
- [ ] `types/agent-profile.ts`：schema 扩展
- [ ] `tool-attribution.ts` + `rollback.ts`：归因与回滚
- [ ] 单测：`memory.test.ts` 扩展（排序/衰减/CRUD/rollback/hitCount 持久化/会话去重）

#### Phase 2.1（Server + UI，2-3 天）
- [ ] `contracts/src/http.ts`：schema 定义
- [ ] `server/src/routes/memory.ts`：6 个路由
- [ ] `server/__tests__/routes/memory.test.ts`：契约测试
- [ ] `app/src/pages/AgentMemoryView.tsx`：主页面
- [ ] `app/src/components/MemoryEditDialog.tsx`：编辑对话框
- [ ] `app/src/router.tsx` + `sidebar.tsx`：路由与导航

#### Phase 2.2（Rollback，1 天）
- [ ] 验证 rollback 覆盖 memory save/update/delete
- [ ] E2E：对话中 save → rollback → 检查 memory.jsonl

#### Phase 3（向量模式，延后或并行）
- [ ] `core/src/embedding/{types,registry}.ts`：接口抽象
- [ ] `store/memory-vector.ts`：向量索引管理
- [ ] `store/memory.ts`：filterEntries 双模式 + RRF
- [ ] `build-resources/sqlite-vec/`：预编译二进制
- [ ] 打包工具 配置
- [ ] 验证：手动切换 `mode:vector` → rebuild → 对比 simple

---

### 五、风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| ~~`hitCount` 内存计数未持久化~~ **已修正** | frequency 跨会话失效 | 改为**持久化**（append 更新行），Phase 1 即落地 |
| ~~Rollback 未覆盖直写旁路~~ **已修正** | agent 直写绕过归因 | **禁止直写**：`MEMORY_PATH_RULE` 改 `llmRead/Write=false`（§十三 §四） |
| 向量索引重建耗时 | 大量记忆（>1000 条）rebuild 阻塞 UI | 异步任务 + 进度条；限制单 agent 记忆上限（如 5000 条） |
| sqlite-vec 扩展打包失败 | 某些平台无法加载 | 降级提示 + 文档说明手动安装路径 |

---

方案已完整，可进入实施。