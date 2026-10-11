# Session 级 Profile 可行性调研（拟定 v1.0.x）

调研时间：2026-10-10
问题：目前 `AgentProfile` 属于 **agent 级**（`.spherse/agents/{slug}/profile.md`），能否增加一个「**属于 session 的** profile（覆盖）」？
结论：**可行**，且已有同构先例（session 级**模型**覆盖）。建议先做最小覆盖集；若采纳，拟定 **v1.0.x**。

## 一、结论

- **技术可行（中等成本）**：`sessions` 表已有 `model` 列，session 级覆盖的整套管道（DB 列 + 迁移 → SessionManager → REST → contract → 前端 UI）已经跑通；把同一模式扩到少量 profile 字段即可。
- **不建议首期做「完整 session profile 文件」**；先做「覆盖少量字段」的最小集（方案 A）。
- 这也正好是此前讨论「预设放哪」的天然归宿——**session 级 = 当前场景 / 预设**的持久化位置。

## 二、现状（代码事实）

| 对象 | 归属 | 位置 / 消费点 |
|---|---|---|
| `AgentProfile` | **agent 级** | `AgentStore.getProfile()` 内存缓存；`buildPromptAndTools` 与 `applyReload` 只用它（`session/agent-assembly.ts:137-201`、`session/agent-runner.ts:561-593`） |
| session 级 **model** 覆盖（先例） | session 级 | DB 列 `sessions.model` + 迁移（`store/session.ts:145-147,486-489`）；`SessionManager.setSessionModel`（`session/session-manager.ts:347-361`）；REST `PATCH .../sessions/:id/model`（`server/src/routes/sessions.ts:161-171`）；contract `sessionModelUpdateRequest`（`contracts/src/sessions.ts:44`）；前端 `api.setSessionModel`（`app/src/lib/api.ts:664`）+ `SessionModelPill` |
| 解析优先级 | — | `resolveModelWithFallback` = `[sessionModel, profile.model, defaultModel]`（`session/status.ts:18-19`）；`buildAgent` 读 `sessions.getSession(sessionId)?.model`（`agent-assembly.ts:218-219`） |
| 热重载 | agent 级 | agent profile 变更 → 标记该 agent **全部** session 重载（`architecture/core.md`「生命周期」）；session 级变更应只失效该 session 的 runner |

**要点**：model 覆盖证明「session 级配置 + 优先级合并 + 全链路管道」在 Spherse 是成熟模式；profile 其余字段只是把它推广。

## 三、可行方案（分档）

### 方案 A（推荐·最小集）：`sessions` 表加 `overrides` JSON 列

- 覆盖字段取 `buildPromptAndTools` 已经消费的输入子集：`systemPromptSuffix`（追加场景 / 人设指令）、`tools`（增 / 删）、`context`（追加预载文件）、`thinkingLevel`、`timePerception`。
- 合并逻辑：`buildPromptAndTools` 接受 `sessionOverride`，在 agent profile 之上叠加；model 已是先例。
- 复用管道：DB 迁移 + `SessionManager` setter + REST（把 `model` 路由泛化为通用 session config）+ contract + 前端。
- 成本：低–中。改动面：`store/session.ts`、`session/session-manager.ts`、`session/agent-assembly.ts`、`server/src/routes/sessions.ts`、`contracts/src/sessions.ts`、`app`。

### 方案 B（完整）：per-session profile 文件

- `.spherse/agents/{slug}/sessions/{id}/profile.md` 或 DB 存全文。
- 更灵活，但面更大（校验、UI、与 agent profile 的差异语义、备份与迁移），**不推荐首期**。

### 方案 C：不做持久 session profile，靠 slash / command 临时改

- 现状已有 `/skill:` `/command:`（session 内临时）；但**非持久**、**不能改 tools / system**。只能算轻量补充，不满足「session 级 profile」命题。

## 四、风险 / 注意事项

- **语义**：session profile 是「**覆盖**」不是「fork」——未设置的字段必须回落 agent profile，避免双份真相。
- **热重载**：session 级变更只 `markReloadPending` 该 session；不得像 agent profile 那样波及同 agent 其他 session。
- **compaction prompt cache**：system 前缀在 session 内稳定即可，不受影响。
- **与 agent 级 skill / mcp / context 的关系**：本期不动，只覆盖 profile 的声明字段。
- **契约与迁移**：需补 contracts schema + DB 迁移 + 测试（AGENTS.md「契约测试接缝」红线）。
- **UI**：复用 `SessionModelPill` 同层（会话设置入口）。

## 五、判定

- **可行**；建议按 **方案 A** 落地，拟定 **v1.0.x**（与「扩大 worldbook 注入」同批评估）。
- 落地前出 design doc（含合并优先级、失效边界、契约与迁移、UI 入口）。

## 六、范围与不做

- 本调研不修改 `docs/dev/backlog.md`、不新增 backlog 条目；不产出 design/plan；不改任何 `docs/official/` 文档。
- 结论基于当前 `packages/core` 代码，未做原型验证。
