# Design：合入上游 #144（settings server 化）

- 日期：2026-10-16，2026-10-17 修订（C1 定 A 真多端；按 review I1–I6/M1–M4 重构）
- 状态：C1 已定 A；D2/D3/D4/D5/D6 待定（D4 已重开，见 §5）
- 上游：`e85db12`（69 文件，+2443/−1350）
- 前置对照：`high-risk-comparison.md` §二

## 1. 背景与目标（C1=A 真多端）

模型配置收归 server（统一 API + 脱敏）**并且** `settings` 功能开到 web（`ELECTRON_ONLY` → `ALL_HOSTS`）+ 设置页 web 兼容，多端可改模型；key 不再明文发给 renderer。只做存储 server 化而不开 web 等于放弃首要动机（见 review C1），故两者是同一目标。

非目标：`tabsEnabled` 回灌（#147 已 verdict 跳过，合入时剥离）；`featureTools` 等 #112 议题。

## 2. fork 现状链路（已逐项核实，含 review M3/M4 补全）

- desktop：单文件 `settings`（`desktop/electron/settings.ts:24` Store，`:86 getMaskedSettings`、`maskModelGroup:45`、`maskWebSearch:55`、`mergeWebSearchApiKey:64`、`mergeWebSearch:70`、`mergeModelGroup:106`、`saveSettings:129`、`restoreEnvFromSettings:151`、`applyProxyEnv:173`、`applyProviderKeysToEnv:200`、`applyWebSearchEnv:218`、`applySettingsToEnv:230`）。
- app store：`app/src/stores/settings-store.ts:9-25`——locale/debugTools/closeToTray/theme/tts/proxy/webSearch/notifications + 8 个 setter，直调 `bridge.saveSettings` 全量对象（含 `models: settings?.models` 回带）。
- web 桥接：`web/host-bridge-web.tsx:27` 整对象 `spherse:settings` 回写（`:42 persistSettings`），但 settings 功能位现为 `ELECTRON_ONLY`（`app/lib/feature-registry.ts:23`），web 侧尚无调用方。
- server：`CreateServerOptions{defaultModel/sampling/thinkingLevel}`（`server/src/index.ts:42-44`，`:118-119` 传入）；`registerSettingsRoutes` 2 参（`server/routes/settings.ts:7`）。
- 模型目录：文本目录是**实例**（desktop `getAppModelCatalog()` 单例 → `server.ts:63` 传入 → `registry.getSupportedProviders()`，`registry.ts:41/59`）；只有图片 `getImageSupportedProviders()` 为 core 静态直调（`routes/settings.ts:18`）。
- contracts/settings.ts：无模型 schema。
- 消费点：`ipc/settings.ts`（get/save-settings handler；save 内含 `syncTray()` + `updateDefaultModel/Sampling/ThinkingLevel` 三职责）、`main.ts:122 restoreEnvFromSettings()`、`use-settings-form`（`save()` 只发 `{models, customProviders}`，靠 desktop merge 兜底其余字段）、模型选择表单（AgentDialogForm/DefaultModelField 类）、`getMaskedSettings` 调用方。

## 3. 上游方案摘要

分区三处：`model-settings.json`（server `ModelSettingsStore`，原子 tmp+rename）+ electron-store hostPrefs/mobileAccess/serverToken + web localStorage 仅 locale。链路 `PUT /api/settings/models` → `applyUpdate` → `applyModelSettingsToEnv`（text key→`PROVIDER_ENV_KEYS`、image→`SPHERSE_IMAGE_MODEL/_API_KEY`，含 env 原值恢复语义）→ registry；`GET` 返回 `sanitize()` 脱敏版；`registerSettingsRoutes` 必传 `{modelSettingsStore,modelCatalog}`；desktop 附一次性 legacy 迁移；桥接瘦身为 prefs only；`settings` 矩阵改为 `ALL_HOSTS`。

## 4. 逐域移植方案

| 域 | 做法 |
|---|---|
| 模型读链 | 新增 contracts 模型 schema + server `ModelSettingsStore` + GET（sanitize）/PUT 路由；desktop/server 装配改传 store（`CreateServerOptions` 增 `modelSettingsPath`，旧 `defaultModel/...` 保留到写链迁移完再删，避免半切） |
| webSearch | 不进 ModelSettings；独立 `web-search-settings.json` + 独立路由（D2-B），复用原子写 + sanitize 模式；`applyWebSearchEnv` 搬 server 后 desktop `restoreEnvFromSettings` 不再应用 webSearch（避双写） |
| tts/proxy/notifications/closeToTray/theme/locale | 进 hostPrefs 扩展（D3-A）；proxy 热应用单独立项（需重启/热应用机制，另议） |
| tabs | 剥离（无消费开关，违反前端守则；并删上游 `defaultHostPrefs`/`migrate` 中的 `tabsEnabled` 读写） |
| catalog | 维持现状（D5-B）：desktop 单例继续传入 server，不跟上游"server 自建"；图片目录保持 core 静态 |
| web 接入（D4 重开） | bridge 收敛为 prefs（仅 locale）；模型读写走新增 REST client（复 `createWebProjectApi` 的 baseUrl+token fetch 模式）；`settings` 矩阵翻为 `ALL_HOSTS`；设置页做 web 兼容审计（capability 门控逐项：proxy/mobile/tray 面板在 web 下隐藏是否符合预期，`getSupportedProviders/getImageProviders` 改走 REST `/api/settings/providers`） |
| legacy 迁移 | 移植 `migrate-legacy-settings.ts` 并扩展 fork 字段（models/hostPrefs/mobileAccess/token/**tts/proxy/webSearch/notifications/theme/locale**，缺一即静默丢，R1），单向 |
| 测试 | 新增 model-settings/store/routes/contracts 测试；**合并** desktop 现有掩码/webSearch 断言（不 replace）；`registerSettingsRoutes` 加参同步 #113 side-panel 测试全部调用点 |
| mask 语义 | 整链一次切换：`****` 合并 → 空串=删除/undefined=保留，不可混用（R2）；renderer 已配 key 输入框同步改为禁用态（抄上游） |

### 4.1 env 应用归属表（拆分最易错处，review I2）

| env 应用 | 归属 | 说明 |
|---|---|---|
| theme | desktop `applyThemeSource` | 不变 |
| provider keys / image / customProviders sync | server `applyModelSettingsToEnv`（复刻 env 原值恢复语义） | 从 desktop 搬走；用注入的 catalog 实例 |
| proxy | desktop `applyProxyEnv` | 不搬；undici `setGlobalDispatcher`，依赖 server 与 desktop 同进程 |
| webSearch | 视 D2（B 则随独立分区进 server） | 搬走后 desktop 不再应用，避双写 |

### 4.2 `save-settings` IPC 三职责拆分表（review I3）

| 现状职责（`ipc/settings.ts:14-24`） | 去向 |
|---|---|
| `saveSettings`（持久化 + env 应用） | 模型部分→`PUT /models`；prefs 部分→`saveDesktopPrefs/saveGeneralPrefs` |
| `syncTray()` | 保留在 prefs 保存路径（closeToTray 变更触发），不可丢 |
| `updateDefaultModel/Sampling/ThinkingLevel`（registry 推送） | server 内部（PUT handler 内更新 registry），IPC 删除 |

### 4.3 字段迁移表要点（R1 准绳，review I6）

- models.text/image + customProviders → `model-settings.json`（经 `ModelSettingsStore.normalize`）。
- locale/theme/debugToolsEnabled/closeToTray → hostPrefs；tts/proxy/webSearch/notifications → hostPrefs 扩展；mobileAccess → 顶层（token 沿用现有懒迁并在迁移时搬到 `serverToken`，同时改造 `getServerToken:346`/`getMobileAccess:363` 改读新位）。
- `openProjects`/`lastActiveProject`/`serverToken` 顶层键原位保留不动。
- 旧 `settings` 键迁移前全量备份，校验通过再删；幂等（新位已存在则跳过，抄上游 `existsSync` 守卫）。
- 注意 `getMaskedSettings` 输出 shape ≠ 持久化 shape（mobileAccess/token 不在输出里），迁移以持久化文件为准逐项打勾。

## 5. 待决策

- D1 范围：A 全量（含表单重写）/ B 小步（先读后写）。倾向 B。
- D2 webSearch 归属：A 并入 ModelSettings / B 独立文件+路由 / C 留 desktop 本地。倾向 B（与模型语义不同，独立迁移互不阻塞；A 省一路迁移但混合关注点）。
- D3 杂项去向：A 进 hostPrefs / B 留旧 key。倾向 A（proxy 热应用另立项）。
- D4 web 接入形态：A REST 直连（复 fetchJson 模式，倾向）/ B bridge 转发。注：原"已关闭"结论作废（C1=A 要求 web 有设置 UI）。
- D5 catalog：A server 自建 / B desktop 单例继续传入。倾向 B（现状即 B，零改动）。
- D6 迁移：A 单向全字段 + 备份幂等 / B 双读兼容。倾向 A。

## 6. 分阶段

- P0 对照冻结：本文件 + `high-risk-comparison.md` 即冻结口径；先写 §4.3 迁移表逐字段认领，无孤儿才开工。
- P1 读链整切：contracts schema + store + GET + desktop 装配传参（旧 options 保留）+ `registerSettingsRoutes` 加参（含 side-panel 测试同步）+ desktop/web 渲染端切 REST 读 + 已配 key 输入框禁用态；验证 desktop 表单显示脱敏值 + REST 直调 GET + 现有测试全绿（P1 即有消费者，不存在无产出阶段）。
- P2 写链整切：PUT + settings-store 8 setter 去 `models` + `use-settings-form` 改 REST + mask 语义切换 + `syncTray` 重挂；验证 key 轮换/删除/空串语义 + 回滚（迁移前备份旧 settings）。
- P3 桥接+迁移+开 web：bridge 瘦身 + `ALL_HOSTS` + 设置页 web 兼容审计 + legacy 迁移（含 fork 字段、备份、幂等）+ `getServerToken`/`getMobileAccess` 改造；验证 web 设置页冒烟 + 无白屏 + 老版本升级演练（备份比对逐字段）。
- P4 webSearch 独立分区（可与 P2 并行，另一人/分支）。

## 7. 验证链

- 单测：model-settings store（原子写/sanitize/合并语义）、routes（PUT 非法回 4xx、GET 脱敏无明文）、migrate（旧 key 全字段映射、幂等二次跑、备份存在）、bridge（locale-only 回写不丢）。
- 契约：新 schema 进 api-contracts；`registerSettingsRoutes` 加参后 side-panel 等既有路由测试全绿。
- 手动：desktop 改模型→重启生效；web 设置页改模型→desktop 生效；legacy settings 升级演练（备份比对逐字段）。
- 回滚：迁移前备份旧 settings 文件；P2 前可独立 revert（旧 options 保留到 P3）。

## 8. 风险（R1–R3 必守）

- R1 丢项：以 §4.3 为准绳逐项打勾；测试加"未知字段告警"断言（读出 fork 不认识的 key 即 fail，防未来漏）。
- R2 掩码：两套语义不可共存，P2 原子切换；过渡期旧 options 保留只读。
- R3 断连：桥接删除与消费点同步同 commit；`ALL_HOSTS` 翻转后先跑 web 设置页冒烟 + desktop 设置页回归。
