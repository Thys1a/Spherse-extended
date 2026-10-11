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

---

# 二期：add/remove + Agent 内置工具（2026-09-16 终审，未实施）

终审决策：Agent 工具与 add/remove 一起做，`edit_card`（`action: update|bulk|add|remove`）一次性完成。工具参数一律扁平 `action` + optional（仿 `manage-trigger.ts:10-22`），禁用 union-of-object 与 `Record(String, Unknown())`。

## 二期依赖图

```
B1 core 写路径重构 + addEntry/removeEntry
      │
      ▼
B2 contracts 加/删 schema ──► B3 server 两路由 ──► B4 sdk 两方法 ──► B5 app 两 handler
      │                                                              │
      ▼                                                              ▼
B6 core 三工具 + capability + 装配              B7 两模板 tools 清单 + presets 构建
      │                                                              │
      └──────────────────────► B8 doc-sync + verify 全量 ◄──────────┘
```

## Task B1: Core — `withLockedDoc` + add/remove

**依赖**：一期 T4（`applyPatchLocked` 现状）。

**改动文件**：
- `packages/core/src/capabilities/card/card-store.ts` [修改]：抽 `withLockedDoc(absPath, rel, mutate: (doc) => string[] | void)`（锁内 read → `toParsedCard` → mutate 改 doc → reserialize → 字节等价短路 → 20MB 检查 → tmp + rename → 回读校验（失败回滚删 tmp）→ 失效缓存）；`applyPatchLocked` 改为其调用方；加 `addEntry(path, entry)`（id **锁内** `max+1`，空表首 id 为 0；缺省字段补默认后按固定键序写出 canonical 12 字段，`extensions` 恒 `{}`）/ `removeEntry(path, id)`（按 id splice，不存在 → `EntryNotFoundError`）

**测试**（`__tests__/capabilities/card/t3-card-store-write.test.ts` 追加）：
- 并发 add 无同 id（**关键不变量**，N 个并行 add 后 id 全唯一且全部落盘可读）
- add 写出 canonical 12 字段（键序 + `extensions: {}` 断言）
- remove 后 JSON 深等（除被删条目外全同）、对不存在 id → `EntryNotFoundError`

**验证**：`npm test --workspace=packages/core`（card 相关）

## Task B2: Contracts — 加/删 schema

**依赖**：B1（store 方法签名定型）。

**改动文件**：
- `packages/contracts/src/card.ts` [修改]：`cardEntryAddRequest`（`{ path, entry }`，entry 为写白名单 10 字段**显式 optional** + `additionalProperties: false`）/ `cardEntryAddResponse`（`{ id }`）/ `cardEntryRemoveRequest`（`{ path, id }`）/ `cardEntryRemoveResponse`（`{ ok }`）
- `packages/contracts/src/index.ts` [修改]：聚合新增 schema 与类型

**测试**（`__tests__/card.test.ts` 追加）：entry 带 `id`/`extensions` → Invalid payload；缺 `path` → Invalid payload。

**验证**：`npm test --workspace=packages/contracts`

## Task B3: Server — 两路由

**依赖**：B1、B2。

**改动文件**：
- `packages/server/src/routes/card.ts` [修改]：`POST /api/projects/:projectId/card/entry/add|remove`（`parseContract` 校验 + `assertWrite` + `sendCardError` 复用）

**测试**（`__tests__/card-routes.test.ts` 追加，真 CardStore 不 mock）：add → `entry` 可读 round-trip；remove → 404；非法 entry 体 → 400。

**验证**：`npm test --workspace=packages/server`（card 相关）

## Task B4: SDK — 两方法

**依赖**：B2。

**改动文件**：
- `packages/sdk/src/runtime/card.ts` [修改]：`add(params)` → `call("card.entry.add")`、`remove(params)` → `call("card.entry.remove")`

**测试**（`__tests__/card.test.ts` 追加）：action 名与参数透传。

**验证**：`npm test --workspace=packages/sdk`

## Task B5: App — 两 handler

**依赖**：B3（ApiClient 方法先行：`lib/api.ts` 加 `cardEntryAdd/cardEntryRemove`）。

**改动文件**：
- `packages/app/src/lib/api.ts` [修改]：两 client 方法（复用 `parseApiResponse`）
- `packages/app/src/ui-sdk/handlers/card.ts` [修改]：`card.entry.add` / `card.entry.remove` 薄代理（`.card.json` 前置校验 + 错误码透传）

**测试**（`handlers/card.test.ts` 追加）：代理调用 + 非 `.card.json` 前置拒绝。

**验证**：`npm test --workspace=packages/app`（card 相关）

## Task B6: Core — 三工具 + capability + 装配

**依赖**：B1（store 全方法）。

**改动文件**：
- `packages/core/src/capabilities/card/tools.ts` [新增]：`createReadCardTool`（`action: list|meta|entries|entry|many`）/ `createSearchCardTool` / `createEditCardTool`（`action: update|bulk|add|remove`），工厂签名 `(cardStore, getPolicy)`，`execute` 内 `assertRead/assertWrite` + 错误转文本（仿 data `errorText`）；`edit_card` **不挂** `withApproval`（与 fs 写工具同例）
- `packages/core/src/capabilities/card/capability.ts` [新增]：`cardCapability(shared?)`（`id: "card"`，`llmPolicyOf(host)`，未传 shared 时懒建 own store；仿 `data/capability.ts:8-26`）
- `packages/core/src/capabilities/builtin.ts` [修改]：`builtinToolCapabilities` 签名改 options 对象（`{ dataStore?, cardStore? }`），注册 `cardCapability(...)`
- `packages/core/src/factory.ts` [修改]：调用行同步（`DefaultCapabilitiesOptions.cardStore?` 已预留单例）
- `packages/core/src/capabilities/card/index.ts` [修改]：导出 tools/capability（按 barrel 规范仅导出消费符号）

**测试**（`__tests__/capabilities/card/t5-card-tools.test.ts` [新增]，仿 `data/t5-tools.test.ts`）：policy deny → 错误文本；三工具成功路径 `content[0].text` 含 JSON block；`add` 非法 entry 体 → `invalid_field` 文本。

**验证**：`npm test --workspace=packages/core`（card 相关）+ `npm run build --workspace=packages/core`

## Task B7: 两模板 tools 清单 + presets 构建

**依赖**：B6（工具名定死：`read_card / search_card / edit_card`）。

**改动文件**：
- `packages/presets/templates/agent-template.md`、`packages/presets/templates/preset-agents/assistant.md` [修改]：`tools:` 各加三名
- 构建触发 sync：`npm run build --workspace=packages/presets`

**验证**：sync 产物含三名；`npm test --workspace=packages/presets`。注：模板只惠及**新建** agent，存量项目 agent .md 需手动加三名（`manage_agent` 或直接编辑），本次不做批量迁移。

## Task B8: doc-sync + verify 全量

**依赖**：B1–B7 全部。

**改动文件**（文档）：
- `docs/official/architecture/capabilities.md`：工具表加 card 一行（`:20` 处），DataStore 暴露段补 CardStore（`:83` 处）
- agent 可见的使用纪律落点：草案 §7（先 `search` 再 `entry`、不要用 `search_content` 扫卡文件）写入 agent 模板正文或 builtin skill
- `docs/official/project-structure.md`：新增文件（tools.ts/capability.ts）如列文件级索引则补行
- `design.md` 附节状态行更新为已实施

**验证**：
- `npm run verify`（lint + build + typecheck + unit + i18n）
- 收尾：backlog 如有对应条目则勾选；E2E 按 `testing.md` 选受影响场景（编辑台页面未在本次范围，agent 工具路径走单测覆盖即可）
