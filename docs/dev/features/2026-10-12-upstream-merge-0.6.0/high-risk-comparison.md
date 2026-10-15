# 高风险三项对照分析（#112 / #144 / #148）

- 日期：2026-10-16
- 状态：待用户决策（本文件只做对照与决策清单，不动手）
- 方法：两路子代理分别深读上游 design/ADR/diff 并核对 fork 现状，证据均为 file:line；结论已收敛，无分歧项。

## 一、#112 Agent 记忆：迁移，不是合并

上游（`ca8e33a`，57 文件）：铲除旧 `memory.jsonl`，换两层存储——`.spherse/agents/{slug}/memory/core.md`（常驻注入，`MAX_CORE_CHARS=4000`）+ `memory.db`（SQLite WAL，entries 表 + FTS5 trigram，`kind`/`source` 为世界书预留）；检索 FTS5 trigram phrase + bm25，<3 字符回退 LIKE；5 工具（`memory_core_append` / `memory_core_replace` / `memory_save` / `memory_recall top8` / `memory_delete`）；`Capability.featureTools(host)` 白名单门控（ADR-0013，不进 toolCatalog）；开关存 profile frontmatter `memory:{enabled}`，缺省 disabled；损坏隔离重建（`memory.db.corrupt-{ts}` + warn，不阻断建会话）；`agentMemory` path 类别 deny。

fork 现状：旧方案——per-agent `memory.jsonl`（`core/src/store/memory.ts:12` `MEMORY_FILE`）、substring recall（`:30` `filterEntries`）、仅 2 工具、`MEMORY_PATH_RULE` 允许 llm 读写、无 app UI、无 brain icon。

### 对照表

| 域 | 上游 | fork | verdict |
|---|---|---|---|
| 存储层 | core.md + sqlite FTS5 + 触发器 + 损坏重建 | jsonl append + substring | replace（整体重写） |
| 工具集 | 5 工具，同步 store API | 2 工具，旧语义 | replace |
| assembly 注入 | `featureTools` 白名单追加 + toolCatalog | 无 featureTools，`buildPromptAndTools` 只返 `{systemPrompt,tools}`（`session/agent-assembly.ts:137`） | replace（引入新 seam） |
| profile | `memory?` 字段 + `mutateProfileFrontmatter` 锁内 RMW | 无 memory 字段 | adapt（纯加法） |
| server 路由 | 新 `routes/agent-memory.ts` 5 路由 | 无此文件 | replace（从零引入） |
| app UI | `MemoryDialog`（348 行）+ 右键入口 + 脑图标 | 无此目录 | replace（从零引入） |
| i18n | `agent-memory.*` 三语 | 无 memory 命中 | adapt（纯加键） |
| skill/template | assistant 改 `memory:{enabled:true}`，guide 改 5 工具 | 白名单旧表述 | adapt（小幅改写 + 重跑 presets build） |
| 安全 path | `agentMemory` deny | `MEMORY_PATH_RULE` allow 读写 | replace（allow→deny 反转） |
| 测试 | memory-store/eval（108 条）/capability/server/app 全新 | 旧 jsonl 断言 | replace（旧断言全废） |

上游迁移策略（明确）：**旧 jsonl 不迁移、不兼容读、不删文件、不清理**，残留变死文件；旧 profile 工具名成无害 no-op。

补充（2026-10-16 实测）：`sqlite FTS5` **作为检索引擎可吸收**——fork 现有 better-sqlite3 编译已带 `ENABLE_FTS5`，trigram 分词器可用，零新依赖，满足 08 §五"零 provider 依赖"硬约束。吸收形态须守 §6.3 三条件：JSONL 仍是唯一真相源，FTS 索引只是派生缓存（随 save/update/delete 同步、可整体 rebuild），`memory_save/recall` API 不变。这正是 §三/§6.2 早就写下的"混合检索 + RRF"里的 trigram/BM25 引擎位，不用等 sqlite-vec。界限：只取引擎，不取"sqlite 升主存储 + core.md + featureTools"（那部分才和 08 冲突）。时机按 §五方案 C：先落 Phase 1 零依赖排序/上限（真缺口），FTS5 作 Phase 1.5 替换子串检索。

### 待决策

- D1 老数据：A 遵上游不迁不读不删 / B 一次性迁移脚本 / C 合并时删除残留。倾向 A（无已发布用户数据则零成本；fork 若有 alpha 真实数据选 B）。
- D2 门控：A 全盘采纳 `featureTools` / B 沿用 profile 白名单。倾向 A（ADR-0013 已论证双真相源问题）。
- D3 缺省开关：A 缺省 disabled、仅 assistant 模板 enabled / B 全开。倾向 A（prompt 快照代价）。
- D4 `kind`/`source` 预留字段：A 保留 / B 砍掉。倾向 A（零成本，日后加列要迁移 db）。
- D5 同步 sqlite API + 降级不阻断会话语义：接受。倾向接受。

风险点：同步 API 致工具链改动 + Windows 句柄顺序；FTS5 中文行为需单测锁定；profile RMW 与 FileWriteMutex 不可重入；快照 cache 语义易被误改。

## 二、#144 settings server 化：全系列最危险的一单

上游（`e85db12`，69 文件，+2443/-1350）：废 `AppSettings` 大一统，拆三区——`model-settings.json`（server `ModelSettingsStore`，原子 tmp+rename）+ electron-store hostPrefs/mobileAccess/serverToken + web localStorage 仅 locale；模型链路 `PUT /api/settings/models` → `applyUpdate` → `applyModelSettingsToEnv` → registry；`GET` 返回 `sanitize()` 脱敏版；`registerSettingsRoutes` 必传 `{modelSettingsStore,modelCatalog}`；desktop 附一次性 legacy 迁移（`migrate-legacy-settings.ts`），web 旧 key 只迁 locale 后删除。

### 对照表（verdict + 风险）

| 设置域 | 上游新模型 | fork 现状 | verdict |
|---|---|---|---|
| desktop 持久化+掩码 | 分区，删 mask/merge/applyEnv 全套 | 单文件 settings + `maskApiKey`/`maskModelGroup`/`merge`/`applyProviderKeysToEnv`（`desktop/electron/settings.ts:40,45,86,129,200`） | adapt（fork 须保留 tts/proxy/webSearch/notifications/mobileAccess）。高：直接 replace 即丢项 |
| webSearch 定制节 | 无此域 | 独立节（settings.ts:55/70/218，store:159，i18n:1320） | keep+自定归属（建议并入 ModelSettings 或另起分区）。中 |
| feature flag | `hostPrefs.tabsEnabled` | 无该项（#147 已 verdict 跳过，`feature-registry.ts:35` 写死） | skip（勿回灌无消费开关）。低 |
| 模型 catalog | server 实例注入 | core 静态目录 + 多处直调 | 维持静态（B）。中：硬切改 server/desktop/测试三处 |
| web 桥接 | 仅存 locale | 整对象回写（`host-bridge-web.tsx:27,33,42`，含 models/theme/tts/proxy/webSearch） | adapt，须先审计 web 是否依赖存 models，否则静默丢项。高 |
| legacy 迁移 | `migrate-legacy-settings.ts` 全量拆写 | 仅 token 懒迁（settings.ts:346） | adapt（必须移植并扩展 fork 字段，否则老用户全丢）。高 |
| server 路由 | 新增 models GET/PUT，`registerSettingsRoutes` 加参 | 仅目录+项目级路由，`CreateServerOptions{defaultModel/...}` | adapt（模型路由可单独摘；加参波及 side-panel 测试）。中 |
| tts/proxy/notifications/theme/locale 等 | `GeneralPrefs{locale}+DesktopPrefs{theme/tabs/debug/closeToTray}`，无槽 | `HostSettings:57-71` + settings-store 全量 | adapt（逐项认领新家；proxy 热应用另议）。高 |

已合入域交互：#113 side-panel 测试需同步加参（`registerSettingsRoutes` 签名变更）；#105 webSearch 无槽位（见上）；#147 tabs 字段必须剥离（无消费开关违反前端守则）。

### 待决策

- D1 范围：A 全量跟随（含表单重写）/ B 小步（先摘 sanitize/contract 让 web 可读脱敏模型，再迁写链）。倾向 B。
- D2 webSearch 归属：A 并入 ModelSettings / B 独立文件+路由 / C 留 desktop 本地。倾向 A。
- D3 tts/proxy/notifications/closeToTray/theme 去向：A 进 hostPrefs 扩展 / B 留旧 key / C 部分 server 化。倾向 A（proxy 热应用另议）。
- D4 web 桥接：A 仅存 locale / B 保留整对象。倾向 A（先审计 web 是否依赖存 models）。
- D5 catalog 实例注入：A 跟 / B 维持静态。倾向 B。
- D6 迁移：A 移植并扩展 fork 字段单向迁 / B 双读兼容。倾向 A。

高危静默回归三件套：丢项（saveSettings/getMaskedSettings 全量 shape）、掩码失效（`****` merge 语义 vs 空串=删除，不可半切）、桥接断连（`get/setSettings` 删除波及 feature-registry/消费点/表单）。

## 三、#148 memory guide 改写：#112 的尾巴

`bab0634`，纯 prompt 跟进（MEMORY_GUIDE 改主被动读写 + recall 描述对齐）。必须在 #112 落地后以 patch 跟进，不可单独先合。无独立决策。

## 建议顺序

#112（含 #148 尾巴）→ #144 垫底。理由：#144 越晚合，已合入的各域（webSearch 设置、tab flag、side-panel 测试签名）被它重写的返工越少；且 #144 的对照表依赖各域现状稳定。
