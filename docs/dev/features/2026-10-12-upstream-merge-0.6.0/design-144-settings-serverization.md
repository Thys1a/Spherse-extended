# Design：合入上游 #144（settings server 化）

- 日期：2026-10-16
- 状态：待决策（D1–D6，见 §5；D4 已自行核实关闭）
- 上游：`e85db12`（69 文件，+2443/−1350）
- 前置对照：`high-risk-comparison.md` §二

## 1. 背景与目标

上游把"设置存在各端本地、私有读写"改成"模型配置收归 server、统一 API + 脱敏、多端共享"。动机：web/移动端也能改模型；key 不再明文发给 renderer。

目标（倾向小步 D1-B）：先摘"脱敏读模型"（让 web 可读），再迁写链，最后动桥接。每步独立可验证，不出现半切状态（掩码语义不可混用，见 R2）。

非目标：`tabsEnabled` 回灌（#147 已 verdict 跳过，合入时剥离）；`featureTools` 等 #112 议题。

## 2. fork 现状链路（已逐项核实）

- desktop：单文件 `settings`（`desktop/electron/settings.ts:24` Store，`:86 getMaskedSettings`、`maskModelGroup:45`、`maskWebSearch:55`、`mergeModelGroup:106`、`applyProviderKeysToEnv:200`、`applyWebSearchEnv:218`）。
- app store：`app/src/stores/settings-store.ts:9-25`——locale/debugTools/closeToTray/theme/tts/proxy/webSearch/notifications + 8 个 setter，直调 `bridge.saveSettings` 全量对象。
- web 桥接：`web/host-bridge-web.tsx:27` 整对象 `spherse:settings` 回写（`:42 persistSettings`）。但 settings 功能位为 `ELECTRON_ONLY`（`app/lib/feature-registry.ts:23`），web 无设置 UI、无调用方 → D4 已关闭：改 locale-only 安全。
- server：`CreateServerOptions{defaultModel/sampling/thinkingLevel}`（`server/src/index.ts:42-44`，`:118-119` 传入）；`registerSettingsRoutes` 2 参（`server/routes/settings.ts:7`）；模型目录为 core 静态函数直调。
- contracts/settings.ts：无模型 schema。
- 消费点（R3 同步清单）：`feature-registry settings` 位、`host-capabilities`、`use-settings-form`、模型选择表单（AgentDialogForm/DefaultModelField 类）、`getMaskedSettings` 调用方。

## 3. 上游方案摘要

分区三处：`model-settings.json`（server `ModelSettingsStore`，原子 tmp+rename）+ electron-store hostPrefs/mobileAccess/serverToken + web localStorage 仅 locale。链路 `PUT /api/settings/models` → `applyUpdate` → `applyModelSettingsToEnv`（text key→`PROVIDER_ENV_KEYS`、image→`SPHERSE_IMAGE_MODEL/_API_KEY`）→ registry；`GET` 返回 `sanitize()` 脱敏版；`registerSettingsRoutes` 必传 `{modelSettingsStore,modelCatalog}`；desktop 附一次性 legacy 迁移；桥接瘦身为 prefs only。

## 4. 逐域移植方案

| 域 | 做法 |
|---|---|
| 模型读链 | 新增 contracts 模型 schema + server `ModelSettingsStore` + GET（sanitize）/PUT 路由；desktop/server 装配改传 store（`CreateServerOptions` 增 `modelSettingsPath`，旧 `defaultModel/...` 保留到写链迁移完再删，避免半切） |
| webSearch | 不进 ModelSettings；独立 `web-search-settings.json` + 独立路由（D2-B），复用原子写 + sanitize 模式；`applyWebSearchEnv` 搬 server（D2 若选 A 则并入，见决策） |
| tts/proxy/notifications/closeToTray/theme/locale | 进 hostPrefs 扩展（D3-A）；proxy 热应用单独立项（需重启/热应用机制，另议） |
| tabs | 剥离（无消费开关，违反前端守则） |
| catalog | 维持静态函数（D5-B），不跟实例注入 |
| web 桥接 | 收敛为仅 locale（D4 已核实安全）；迁移时读旧 `spherse:settings` 只取 locale 后删 key（抄上游） |
| legacy 迁移 | 移植 `migrate-legacy-settings.ts` 并扩展 fork 字段（models/hostPrefs/mobileAccess/token/**tts/proxy/webSearch/notifications/theme/locale**，缺一即静默丢，R1），单向 |
| 测试 | 新增 model-settings/store/routes/contracts 测试；**合并** desktop 现有掩码/webSearch 断言（不 replace）；`registerSettingsRoutes` 加参同步 #113 side-panel 测试全部调用点 |
| mask 语义 | 整链一次切换：`****` 合并 → 空串=删除/undefined=保留，不可混用（R2）；renderer 已配 key 输入框同步改为禁用态（抄上游） |

## 5. 待决策

- D1 范围：A 全量（含表单重写）/ B 小步（先读后写）。倾向 B。
- D2 webSearch 归属：A 并入 ModelSettings / B 独立文件+路由 / C 留 desktop 本地。倾向 B（与模型语义不同，独立迁移互不阻塞；A 省一路迁移但混合关注点）。
- D3 杂项去向：A 进 hostPrefs / B 留旧 key。倾向 A（proxy 热应用另立项）。
- D4 web 桥接：已核实关闭，选 A（仅 locale）。
- D5 catalog：A 跟实例注入 / B 维持静态。倾向 B。
- D6 迁移：A 单向全字段 / B 双读兼容。倾向 A。

注：D2 此处倾向 B，与对照分析初稿的 A 不同——重看了 `applyWebSearchEnv` 与模型 env 注入分属两套 key 体系（`SPHERSE_WEB_SEARCH_*` vs provider keys），硬并带来跨域耦合；独立文件复用同一原子写模式即可。

## 6. 分阶段

- P0 对照冻结：本文件 + `high-risk-comparison.md` 即冻结口径；先写字段迁移表（R1），逐字段认领新家，无孤儿才开工。
- P1 读链：contracts schema + store + GET + desktop 装配传参（旧 options 保留）；验证 web 可读脱敏模型 + 现有测试全绿。
- P2 写链：PUT + renderer 表单禁用态 + mask 语义整切；验证 key 轮换/删除/空串语义 + 回滚（迁移前备份旧 settings）。
- P3 桥接+迁移：bridge 瘦身 + 消费点同步 + legacy 迁移（含 fork 字段）+ side-panel 测试加参；验证无 settings 白屏 + 老版本升级演练。
- P4 webSearch 独立分区（可与 P2 并行，另一人/分支）。

## 7. 验证链

- 单测：model-settings store（原子写/sanitize/合并语义）、routes（PUT 非法回 4xx、GET 脱敏无明文）、migrate（旧 key 全字段映射、幂等二次跑）、bridge（locale-only 回写不丢）。
- 契约：新 schema 进 api-contracts；`registerSettingsRoutes` 加参后 side-panel 等既有路由测试全绿。
- 手动：desktop 改模型→重启生效；web 读模型显示"已配置"；legacy settings 升级演练（备份比对逐字段）。
- 回滚：迁移前备份旧 settings 文件；P2 前可独立 revert（旧 options 保留到 P3）。

## 8. 风险（R1–R3 必守）

- R1 丢项：以 P0 迁移表为准绳，`saveSettings`/`getMaskedSettings` 全量 shape 逐项打勾；测试加"未知字段告警"断言（读出 fork 不认识的 key 即 fail，防未来漏）。
- R2 掩码：两套语义不可共存，P2 原子切换；过渡期旧 options 保留只读。
- R3 断连：桥接删除与消费点同步同 commit；`settings:ELECTRON_ONLY` 门控下先跑 renderer 设置页冒烟。
