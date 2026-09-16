# Implementation Plan: `.card.json` App 层接口（`card.*`）

- 日期：2026-09-15
- Design：`design.md`（同目录；需求提取 + 锁定决策 + 实测结论，本文不重复 rationale，只写 what/how/verify）
- 范围：草案阶段一的 App 层部分（8 个 op + 页面 `spherse.card.*` 通道）。Agent 侧三工具、编辑台页面、数据迁移另立项。
- 模式：按依赖顺序执行，每个 Task 独立可验证

## 任务依赖图

```
T1 contracts card.ts schema + 错误码
      │
      ▼
T2 core card 域：path-guard + parser + cache（纯逻辑 + fs 读）
      │
      ▼
T3 core 检索：search + store 读方法（list/meta/entries/entry/many）
      │
      ▼
T4 core 写方法（reserialize + 等价短路 + tmp+rename + 回滚）
      │
      ▼
T5 装配（factory + project-runtime + defaultCapabilities 改 options）
      │
      ▼
T6 server routes/card.ts + contracts 注册 + ApiClient 方法
      │
      ▼
T7 app handlers/card.ts + barrel + 配额 300 + sdk runtime/card.ts
      │
      ▼
T8 presets skill 文档 + verify 全量 + 大卡手测
```

## 共享类型契约（各 Task 以此为准，勿自行变形）

```ts
// packages/core/src/capabilities/card/types.ts
export interface CardStore {
  list(dir?: string): Promise<CardListItem[]>;
  meta(path: string): Promise<CardMeta>;
  entries(path: string, filter?: { enabled?: boolean; constant?: boolean }): Promise<CardEntrySummary[]>;
  search(path: string, opts: CardSearchOpts): Promise<CardSearchHit[]>;
  entry(path: string, id: number): Promise<CardEntry>;
  entryMany(path: string, ids: number[]): Promise<CardEntry[]>;
  updateEntry(path: string, id: number, patch: EntryPatch, opts?: { idempotencyKey?: string }): Promise<{ id: number; changed: string[] }>;
  bulkUpdate(path: string, ids: number[], patch: EntryPatch, opts?: { idempotencyKey?: string }): Promise<{ count: number }>;
}

export type CardErrorCode =
  | "card_not_found" | "entry_not_found" | "invalid_json" | "invalid_field"
  | "write_failed" | "forbidden" | "too_large" | "bad_request";

export class CardNotFoundError extends Error {}
export class EntryNotFoundError extends Error {}
export class InvalidFieldError extends Error { constructor(public fields: string[]) { super("invalid field"); } }
export class CardFileCorruptedError extends Error {}
```

- 可写字段白名单：`keys / secondary_keys / comment / content / constant / selective / insertion_order / enabled / position / use_regex`；`position` 仅 `before_char | after_char`；`id` 与 `extensions` 全拒绝（`extensions.position` 与顶层 `position` 同名不同义）。
- `search` 默认：`fields = ["keys", "comment"]`，`onlyEnabled = true`，`limit = 20`，`snippetChars = 160`。
- 响应裸值风格（不用 `{ ok }` 信封）；写序列化固定 `JSON.stringify(doc, null, 2)`，无尾随换行。
- 读不持锁，写持 `fileWriteMutex`（与 DataStore 同例）。

---

## Task 1: Contracts — `card.ts` schema + 错误码

**依赖**：无。

**改动文件**：
- `packages/contracts/src/card.ts` [新增]：8 组 request/response TypeBox schema（§共享契约的 request 形状；`EntryPatch` 逐字段类型 + `position` enum；`fields` 枚举 `keys/secondary_keys/comment/content`；`idempotencyKey` 可选）+ `schemas` 导出 + `CardErrorCodeContract` 类型
- `packages/contracts/src/index.ts` [修改]：聚合 schemas 与类型（仿 `data` 条目）

**测试**（`packages/contracts/src/__tests__/card.test.ts` [新增]，仿既有契约测试模式：正向通过 / 负向抛 Invalid payload）：
- 缺 `path`、非法 `fields` 值、非法 `position` 值、非 `.card.json` 形状（如需在 schema 层约束则测之，否则留给 T2 path-guard）

**验证**：`npm test --workspace=packages/contracts`

---

## Task 2: Core — path-guard + parser + cache

**依赖**：T1（错误码类型）。

**改动文件**：
- `packages/core/src/capabilities/card/types.ts` [新增]：§共享契约 + 各 Result 类型（`CardListItem/CardMeta/CardEntrySummary/CardSearchHit/CardEntry`，`entries` 不含 content）
- `packages/core/src/capabilities/card/path-guard.ts` [新增]：`resolveCardFile(root, file)`——`resolveProjectPath` + `.card.json` 后缀 + `.spherse/` 禁入（仿 data `path-guard.ts`，语义对齐 app `validateFileParam`）；`toPosixRelative` 复用 data 同名函数或内联
- `packages/core/src/capabilities/card/parser.ts` [新增]：`parseCard(bytes)`——`JSON.parse`（失败 → `CardFileCorruptedError`）+ v3 形状校验（`spec/spec_version/data.character_book.entries` 数组）+ 条目抽取；容忍 `extensions.category` 缺失
- `packages/core/src/capabilities/card/cache.ts` [新增]：解析后卡对象 LRU，key 含内容 sha256（避免 stat/read 竞态），按字节数设上限（仿 `outline-cache.ts`，cap 64 条目改字节预算）
- `packages/core/src/capabilities/card/index.ts` [新增]：先只导出 types + 错误类（T3/T4 扩充）

**测试**（`packages/core/src/__tests__/capabilities/card/`，新建目录）：
- path-guard：合法 `.card.json`、非后缀拒绝、`.spherse/` 禁入、越界路径拒绝（用 `..`）
- parser：合法双真实卡形状（以内联 fixture 覆盖 12 字段条目）、撕裂 JSON → `CardFileCorruptedError`、缺 `entries` → 同错
- cache：命中、内容变化失效、字节上限淘汰

**验证**：`npm test --workspace=packages/core`

---

## Task 3: Core — search + store 读方法

**依赖**：T2。

**改动文件**：
- `packages/core/src/capabilities/card/search.ts` [新增]：`searchEntries(entries, opts)`——keys 双向包含命中 / comment 包含 / content 包含取 `snippetChars` 摘要；`use_regex` 条目 `query` 按正则解释，非法正则降级字面量并仅在该命中时标注 `regexFallback: true`；`onlyEnabled` 过滤；`limit` 截断
- `packages/core/src/capabilities/card/card-store.ts` [新增]：`createCardStore({ projectRoot, fileWriteMutex, logger })` 读 half——`list`（递归 walk 复用 `shouldSkipDirEntry` 语义 + 逐项读策略过滤 denied 目录）/ `meta`（`regexCount = data.extensions.regex_scripts?.length ?? 0`）/ `entries`（filter `{ enabled?, constant? }`，`words = content.length`）/ `entry` / `entryMany` / `search`；读走 cache，不持锁
- `packages/core/src/capabilities/card/index.ts` [扩充]：导出 `createCardStore`

**测试**：
- search：三档各自命中与未命中、`onlyEnabled` 过滤、`use_regex` 正则命中与非法降级、snippet 长度截断、`limit` 截断
- store：list 跳过 dotfile/node_modules/denied 目录、meta 不含 content、entries filter 四档组合、entry 不存在 → `EntryNotFoundError`、文件不存在 → `CardNotFoundError`

**验证**：`npm test --workspace=packages/core`

---

## Task 4: Core — 写方法（reserialize + 等价短路 + 原子写）

**依赖**：T3。

**改动文件**：
- `packages/core/src/capabilities/card/card-store.ts` [扩充]：`updateEntry` / `bulkUpdate`——锁内 load → 白名单 + 类型/值域校验（非法 → `InvalidFieldError` 含字段明细）→ 应用 patch → `JSON.stringify(doc, null, 2)` → **与原字节相等则跳过写盘** → 否则 20MB 上限检查（超限 → `too_large`，仿 `MAX_FILE_SIZE`）→ 同目录 `.{basename}.spcard.tmp` 写入 → `fs.rename` → 回读 `JSON.parse` 校验 → 失败删 tmp + 抛 `write_failed` → 失效缓存
- `idempotencyKey`：接收并忽略（参数保留供未来扩展；update 语义天然幂等，不建 LRU 机制）

**测试**：
- 白名单：`id` / `extensions`（含 `extensions.position` 同名陷阱）→ `invalid_field`；非法 `position` 值 → 同错
- 等价短路：同值 patch 不产生写盘（mtime/内容断言）
- 原子性：rename 前注入异常，原文件字节不变
- 回滚：回读校验失败路径（mock `fs.readFile` 第二次返回撕裂内容），断言删 tmp + 抛错
- 并发：50 个并行 update/bulk 无丢失
- 与 `write_file` 共享 mutex 互斥（仿 `shared-write-mutex.test.ts` 模式）

**验证**：`npm test --workspace=packages/core`

---

## Task 5: Core — 装配（factory + runtime + capabilities 签名）

**依赖**：T4。

**改动文件**：
- `packages/core/src/factory.ts` [修改]：`createCardStore({ projectRoot, fileWriteMutex, logger })` 建单例；`defaultCapabilities` 改 options 对象传参（`{ projectStore, logger, dataStore?, cardStore? }`，避免位置参数堆积）；`ProjectRuntime` 构造传入 `cardStore`
- `packages/core/src/project-runtime.ts` [修改]：`CardStore | undefined` 字段 + deps 类型
- `packages/core/src/index.ts` [修改]：按 barrel 规范仅导出 T6 需要的 `CardStore` 类型与错误类

**测试**：
- 装配契约测试：真 `assembleProject` 的 runtime 暴露可用 `CardStore`（读 + update round-trip 落盘断言），不 mock 被测方法本身（仓库红线）

**验证**：`npm test --workspace=packages/core && npm run build --workspace=packages/core`

---

## Task 6: Server — routes + ApiClient

**依赖**：T5（CardStore 单例）、T1（contracts schema）。

**改动文件**：
- `packages/server/src/routes/card.ts` [新增]：8 条 `POST /api/projects/:projectId/card/...`（list/meta/entries/search/entry/entry/many/entry/update/entry/bulk）——`dataStoreOf` 同构取 `ctx?.runtime.cardStore`（缺失 → 500 风格错误，仿 data）；`parseContract` 校验；读过 `assertRead`、写过 `assertWrite`（仿 content 路由）；`sendCardError` 错误映射（仿 `sendDataError`，code 透传）
- `packages/server/src/routes/index.ts` [修改]：注册
- `packages/app/src/lib/api.ts` [修改]：`cardList/cardMeta/cardEntries/cardSearch/cardEntry/cardEntryMany/cardEntryUpdate/cardEntryBulk`（复用 `parseApiResponse`，不裸 parse）

**测试**（`packages/server/src/__tests__/card-routes.test.ts` [新增]，仿 `data-routes.test.ts`）：
- schema：缺字段 422、非法 file 形状 422
- 行为：entries 不含 content、search 默认 `onlyEnabled`、白名单外 patch → 网关剥离未知键后 200 空操作（Fastify 全局 `removeAdditional` 实测覆盖 `additionalProperties: false`，改全局影响全站故接受；类型非法仍网关 400；`invalid_field` code 为 store 级纵深，core 单测覆盖）、denied 路径 403 + `forbidden`
- **契约测试（不 mock CardStore）**：真 ProjectManager 装配的 round-trip（update 落盘 + 回读断言）至少一条

**验证**：`npm test --workspace=packages/server && npm run build --workspace=packages/server`

---

## Task 7: App + SDK — handler 薄代理 + 配额 + runtime

**依赖**：T6。

**改动文件**：
- `packages/app/src/ui-sdk/handlers/card.ts` [新增]：8 个 action（`card.list/meta/entries/search/entry/entry.many/entry.update/entry.bulk`）薄代理 ApiClient；`.card.json` 前置校验（仿 `validateFileParam`）；**错误码透传** `respond(ctx, false, { error: code })`（区别于 data handler 的裸 `respond(ctx, false)`）
- `packages/app/src/ui-sdk/index.ts` [修改]：补 barrel import
- `packages/app/src/ui-sdk/rate-limit.ts` [修改]：`MAX_CALLS_PER_MINUTE` 30 → 300
- `packages/sdk/src/runtime/card.ts` [新增]：8 方法 `call("card.*", params)` 薄封装；`packages/sdk/src/runtime/index.ts` [修改]：组装进 `window.spherse.card`
- `docs/official/architecture/ui-sdk.md` + `packages/presets/skills/spherse-use-ui-sdk/SKILL.md` [修改]：配额 30 → 300 文案；SKILL 补 `spherse.card.*` 一节（参数表 + code 枚举 + `file:update` 订阅示例）

**测试**：
- `packages/app/src/ui-sdk/handlers/card.test.ts` [新增]：mock ApiClient 断言代理 + 错误码透传形状 + 非 `.card.json` 前置拒绝（仿 `handlers/data.test.ts` 模式）
- sdk 单测：`call("card.*")` 动作名与参数透传（仿 `messaging.test.ts`）

**验证**：`npm test --workspace=packages/app && npm run build --workspace=packages/sdk`

---

## Task 8: 全量验证 + 大卡手测

**依赖**：T1–T7 全部。

**改动文件**：无（验证 task）。

**验证**：
- `npm run verify`（lint + build + typecheck + unit + i18n）
- 手测（真实卡：292 条沉沦法则级）：list/meta/entries/search 延迟记录；entry.update 后 git diff 确认未改条目零 diff；外部改动触发 `file:update` 重拉；`entries` 的 `words` 抽查 = `content.length`
- 收尾：`design.md` 状态行更新为已实施；检查 `docs/official/` 同步项（ui-sdk 配额已在 T7；如新增能力清单条目需补对应域文件）
