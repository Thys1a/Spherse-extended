# Session 级 profile 覆盖 — 调研（2026-11-01）

- 前置：`docs/dev/investigation/2026-10-06-cross-project-v1/07-session-profile-feasibility.md`（2026-10-10，结论可行，推荐方案 A）。
- 背景：排期表曾将其划线；本调研建议保留，待定夺（见 §四）。
- 结论：07 方案 A 未过期，成本低–中；需求仍成立且与 agent 级配置正交。

## 一、代码现状

- 同构先例管道**完好**：`sessions.model` 列（`core/src/store/session.ts:598`）＋ `SessionManager.setSessionModel` ＋ REST `PATCH .../sessions/:id/model` ＋ contract `sessionModelUpdateRequest` ＋ `SessionModelPill`（`Composer.tsx:330`）全在。
- `overrides` 列**零实现**：全仓库无 `sessions` 表 JSON 覆盖列、无通用 session config 路由、无会话设置入口（除模型外）。
- 优先级合并与热重载语义已有先例可抄：`resolveModelWithFallback`（session → profile → 全局），agent profile 变更波及同 agent 全 session、session 级变更只 mark 该 session。

## 二、可行性

- 采用 07 方案 A：`sessions` 表加 `overrides` JSON 列（DB 迁移），覆盖集取 `buildPromptAndTools` 已消费输入子集（`systemPromptSuffix`、`tools`、`context`、`thinkingLevel`、`timePerception`），`buildPromptAndTools` 接受 `sessionOverride` 在 agent profile 之上叠加。
- 复用管道：把 `model` 路由泛化为通用 session config（`server/src/routes/sessions.ts`＋`contracts/src/sessions.ts`），UI 复用 `SessionModelPill` 同层（会话设置入口）。
- 否决 07 方案 B（per-session profile 文件）：校验/UI/差异语义/迁移面大，本期不做。

## 三、影响面

- core：`store/session.ts`（列＋迁移）、`session/session-manager.ts`（setter）、`session/agent-assembly.ts`（合并）。
- server/contracts：通用 session config 请求 schema（照 `sessionModelUpdateRequest` 模式）、路由、错误映射。
- app：会话设置入口 UI＋i18n＋组件测试；`SessionModelPill` 同层复用。
- 测试：合并优先级（session＞agent＞全局）、缺席回落、热重载只波及本 session、迁移、契约测试。
- 必须遵守：覆盖非 fork（未设字段回落）、compaction prompt 缓存不受影响、与 agent 级 skill/mcp/context 无交集。

## 四、定夺事项（划线去留）

- 反对废弃的三条理由：需求仍成立（同 agent 不同会话不同人设/工具集，现有机制都笨重）；成本仍低–中；划线无附带理由，疑似排期挤占而非需求否定。
- 若坚持废弃，请补一句理由（否则后人反复提起）；若保留，请去排期表划线。
