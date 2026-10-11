# `.card.json` App 层接口（`card.*`）调研

> 状态：**一期 + 二期已实施（2026-09-16，未 commit）**。plan 见 `plan.md`（同目录，T1–T8、B1–B8 全部完成）。本文只覆盖《设计草案-卡编辑台.md》**第五节「接口规格（App 层）」**的需求提取与代码侧调研，供阶段一立项使用。页面（第六节）、迁移（第八节）不在本文范围。
> 来源草案：`设计草案-卡编辑台.md`（根目录）。

## 一、§5 需求提取（XE "requirements"）

### 5.1 op 清单（一期 8 个 + 二期 2 个）

| op | 参数 | 返回 | 用途 |
|---|---|---|---|
| `card.list` | `{ dir? }` | `[{ path, name, entryCount, bytes }]` | 列项目内所有 `.card.json`（编辑台下拉） |
| `card.meta` | `{ path }` | `{ spec, name, entryCount, enabledCount, regexCount }` | 卡概览，**不带正文** |
| `card.entries` | `{ path, filter? }` | `[{ id, comment, keys, constant, enabled, position, insertion_order, words }]` | 条目清单，**不含 content** |
| `card.search` | 见 §5.2 | 命中清单（**不含全文**，可带 snippet） | AI 精确检索 |
| `card.entry` | `{ path, id }` | 单条完整字段（含 content） | 详情面板 |
| `card.entry.many` | `{ path, ids[] }` | 多条完整字段 | 批量取 |
| `card.entry.update` | `{ path, id, patch }` | `{ ok, id, changed[] }` | 改单条 |
| `card.entry.bulk` | `{ path, ids[], patch }` | `{ ok, count }` | 批量改（开关一批） |

二期：`card.entry.add` / `card.entry.remove`（v3 数字 `id` 重编号风险，暂缓）。

### 5.2 `card.search` 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `path`（必填）/ `query` / `fields` | `fields` 默认 `["keys","comment"]`，可加 `"content"` | 条目 `use_regex` 为 true 时 `query` 按正则解释 |
| `onlyEnabled` | `true` | 停用条目默认查不到（由检索层保证，不靠指令提醒） |
| `limit` | 20 | 条数上限 |
| `snippetChars` | 160 | `content` 命中只回摘要，不吐全文 |

匹配三档：`keys` 双向包含命中／`comment` 模糊／`content` 包含（snippet）。`entries`/`search`/`meta` 永远不带全文，只有 `entry`/`entry.many` 带 `content`。

### 5.3 写入安全约定（硬要求，6 条）

1. 写前 `JSON.parse` 校验一次，写后回读校验一次，任一失败即回滚。
2. **只替换目标条目的文本片段，不整份重排**（保缩进换行，diff 友好）。
3. 原子写：先写临时文件，成功后替换。
4. 字段白名单：`keys / secondary_keys / comment / content / constant / selective / insertion_order / enabled / position / use_regex`；`id` 与 `extensions` 默认只读（`extensions.category` 例外）。
5. 路径限制：项目根内、`.json` 结尾、拒绝 `.spherse/`。
6. 错误码统一：`card_not_found / entry_not_found / invalid_json / invalid_field / write_failed`。

### 5.4 两侧通道

- 页面：新开 `spherse.card.*`，与 `spherse.data.*` 并列；**不要塞进 `spherse.api.call`**（只读语义）。
- Agent：新增三个内置工具 `read_card / search_card / edit_card`，底层调同一批 op（Agent 侧另立项，本文只记接缝）。

## 二、代码调研结论

### 2.1 `spherse.data.*` 是 `card.*` 的完整模板链路

`card.*` 页面通道应逐层仿 `data.*`，共 5 层（文件行号为实测现状）：

1. 注入 SDK：`packages/sdk/src/runtime/data.ts:9-16`（`call("data.get", …)` 薄封装）→ 组装进 `window.spherse`（`packages/sdk/src/runtime/index.ts:40-54`）。`card.*` 需新增 `runtime/card.ts` 同构文件并在此组装；bundle 经 esbuild 打包为 `dist/browser.js` → `SDK_SOURCE` 字符串，`injectHeadScript` 幂等注入。
2. host 桥注册：`packages/app/src/ui-sdk/handlers/data.ts:20-122` 以 `registerAction("data.get", …)` 注册，`packages/app/src/ui-sdk/index.ts:1-14` 以 import 副作用引入（无自动发现，新文件须补 barrel import），`packages/app/src/ui-sdk/registry.ts:5-20` 分发，未知 action 仅 `console.warn`。
3. 入站门禁：`packages/app/src/ui-sdk/use-spherse-message-listener.ts:32-50` 做 origin 白名单 + `checkRateLimit`；`packages/app/src/ui-sdk/rate-limit.ts:1-32` 为 30 次/60s 模块级共享配额，白名单仅读操作（`data.get/keys/entries/mutate` + `chat.rect/dock`），**`data.set/delete` 不在白名单**。`card.*` 应同例沿用同一门禁；配额按方案 §核心决策-7 由 30 → 300（编辑台高频写需求）。
4. HTTP 客户端：`packages/app/src/lib/api.ts:205-255`（`dataRead/dataMutate/dataRawSet/dataRawDelete`，经 `parseApiResponse` 校验）。`card.*` 需新增 `cardList/cardMeta/…` 方法，不裸 parse。
5. 服务端：`packages/server/src/routes/data.ts:44-122`（origin 固定 `"sdk"`，错误映射 `sendDataError`），contracts 见 `packages/contracts/src/data.ts:1-60`，聚合于 `packages/contracts/src/index.ts:17-33`。

### 2.2 `api.call` 必须保持只读（硬约束）

`packages/app/src/ui-sdk/handlers/api.ts:20-30` 为显式 ALLOWLIST（9 个只读 op：agents.list/get、sessions.list/messages/status、content.get/listDir/stat、fileTree），错误码仅 `bad_request / unknown_op / request_failed`；约束注释（`api.ts:5-12`）与架构文档（`docs/official/architecture/ui-sdk.md:55-59`）及面向 LLM 的 skill（`packages/presets/skills/spherse-use-ui-sdk/SKILL.md:405-416`）三处一致声明"写一律走专用 action"。**`card.entry.update/bulk` 绝不能进此白名单**，否则破坏三处文档共同承诺的只读约定。

### 2.3 纯 renderer 实现走不通，必须新增 server 路由

`ApiClient` 已有 `getContent`（`lib/api.ts:257-261`，读）与 `saveContent`（`lib/api.ts:263-271`，整份 PUT → `server/routes/content.ts:131-149` → `PM.writeFile`）。若 `card.*` 只用这两条做纯 renderer 实现（读整份 → renderer 侧 `JSON.parse` → 回写整份），违反 §5.3-2（不整份重排），且沉沦法则 1.8MB/15026 行全量经 postMessage（10s 超时，`sdk/runtime/messaging.ts`）与 iframe 解析不可接受。结论：**server 侧新增 card 路由做解析/检索/读写，renderer 只做薄代理**——与 `data.*`（重逻辑在 core `DataStore`，路由只传 `origin: "sdk"`）同构，重逻辑归 core 新建 `card` 域（或 `capabilities/card/`），路由只做参数校验与错误映射。

### 2.4 写路径不能复用 `PM.writeFile`，要仿 `DataStore.persist`

- `PM.writeFile`（`packages/core/src/project-manager.ts:309-314`）：`resolveProjectPath` + `fileWriteMutex.run` + 直接 `fs.writeFile`——**非 tmp+rename 原子写**，且整份覆盖，不满足 §5.3-2/3。
- `DataStore.persist`（见 `2026-08-20-data-json-selective-access/plan.md:113`）：同目录 `.{basename}.spdata.tmp` 写入 → `fs.rename` → sha256 版本 → 失效 outline 缓存 → 发 `DataChangeEvent`，全程持 `fileWriteMutex`。**`card` 写路径照抄此模板**（tmp 后缀另取如 `.spcard.tmp`，回读校验失败即回滚删 tmp）。
- §5.3-2 的"不整份重排"已由实测解决：真实卡 `JSON.stringify(parsed, null, 2)` 与原文件逐字节相等，整份 reserialize 对未改条目天然零 diff（详见方案 §核心决策-2）。字符串手术方案已否决。

### 2.5 路径守卫：建议比草案收紧为 `.card.json`

- 现有三层：`resolveProjectPath/assertInsideProject/isPathInside`（`core/utils/path-safety.ts`，仓库红线禁 `startsWith` 判断）；`serverAccessPolicy.assertRead/assertWrite`（server content 路由每条必调）；data 专用 `resolveDataFile`（`path-guard.ts`，`.data.json` 后缀 + `.spherse/` 禁入，语义对齐 app `handlers/data.ts:4-9` 的 `validateFileParam`）。
- 草案 §5.3-5 写的是"`.json` 结尾"，但 8 个 op 语义全是卡操作。建议收紧为 **`.card.json` 后缀 + `.spherse/` 禁入**（与 `validateFileParam` 只认 `.data.json` 同例），否则 `card.entry.update` 可写任意 json，超出设计意图。`list` 的 `dir?` 参数同样走 `resolveProjectPath` + 目录收敛。

### 2.6 `file:update` 事件零新增，直接复用

编辑台"文件被外部改动重拉清单"已有现成机制：host 侧 bus fs-watch → 300ms 按 path 去抖定向 postMessage（`architecture/ui-sdk.md:67-72`），SDK 侧 `events.on("file:update", { path }, handler)`（`SKILL.md:340-379`，相对路径经 `document.baseURI` 解析）。`card.*` 页面直接订阅目标卡路径即可，无需新事件类型。

### 2.7 Agent 侧接缝（只记录，不设计）

`read_card / search_card / edit_card` 归 core capabilities（仿 `capabilities/data/tools.ts` 的 `createReadDataTool` 工厂 + `(dataStore, getPolicy)` 签名），经 `factory.ts` 装配单例 + `agent-template.md` 的 `tools:` 白名单暴露。底层"调同一批 op"即调 server card 路由（与页面同源），检索默认 `onlyEnabled: true`（草案 §7-3）。属 core 侧另立项，不在 App 层 `plan.md` 内。

## 三、推荐实施顺序（App 层 `plan.md` 用）

1. `contracts` 加 `card.ts` schema（list/meta/entries/search/entry/many/update/bulk 的 request/response + §5.3-6 错误码，建议 snake_case 对齐 data 链路 `code` 枚举风格）+ `index.ts` 聚合。
2. server 加 `routes/card.ts` + `routes/index.ts` 注册 + `ApiClient` 加 `card*` 方法（复用 `parseApiResponse`）。
3. core 加 card 域（解析/检索/search 三档匹配 + use_regex 正则解释 + snippet + reserialize 写 + 等价短路 + tmp+rename + 回读校验回滚 + 白名单校验）。
4. app 加 `handlers/card.ts`（薄代理 + `.card.json` 前置校验 + 错误码透传）+ `index.ts` barrel + sdk `runtime/card.ts` + 打包 + 配额 30 → 300。
5. presets `spherse-use-ui-sdk/SKILL.md` 补 `spherse.card.*` 一节（参数表 + 只读/写语义 + `file:update` 订阅示例）。

## 四、开放问题（2026-09-15 审查已全部拍板，结论见方案 §核心决策）

1. ~~路径后缀~~ → 定为 `.card.json`。
2. ~~`words` 定义~~ → 定为 `content.length`；草案示例 1842 经实测不存在，留档为已知偏差。
3. ~~幂等~~ → 保留可选 `idempotencyKey` 参数，不建专门机制。
4. ~~性能~~ → 缓存 key 含内容哈希 + 按字节上限；手测列入验证清单。
5. ~~`extensions.category`~~ → 整个 extensions 只读，category 走阶段二迁移一次性写入。

## 五、验证思路（实施时）

- contracts 单测：各 request schema 正向/负向（缺 `path`、非法 `fields`、非 `.card.json` 形状）。
- server 契约测试：真 PM 装配 route 测试至少一条 round-trip（entry.update 落盘 + 回读断言），不 mock 被测方法本身（仓库红线）。
- app 单测：handler 薄代理 + `.card.json` 前置拒绝 + 白名单行为（仿 `handlers/data.test.ts` 模式）。
- sdk 单测：`call("card.*")` 动作名与参数透传。
- 手动：沉沦法则级大卡（1.8MB）list/meta/entries/search 延迟实测；外部改动触发 `file:update` 重拉。

# 方案    

## 核心决策（已锁定，2026-09-15 审查结论）

1. **路径守卫**：`.card.json` 后缀 + 禁入 `.spherse/`（收紧草案的"`.json` 结尾"）。
2. **写入策略**：整份 `JSON.stringify(parsed, null, 2)` reserialize，**无尾随换行**；序列化结果与原字节相等时跳过写盘。**已实测**：两张真实卡（292 条 / 31 条，`chara_card_v3`）`JSON.stringify(j, null, 2) === 原文件` 均为 true——未改动条目零 diff，字符串手术彻底放弃。（2026-09-16 终审接受 reserialize：JSON 字符串手术风险高——转义/Unicode/缩进推断；业界标准做法均为整份重排——Prettier / ESLint --fix / package.json 管理工具；功能安全优先于 diff 友好。）
3. **字段位置（已实测）**：`position`（string，如 `after_char`）与 `insertion_order` 在条目**顶层**；`extensions.position` 是另一个数字字段（酒馆 depth 位置），**必须**保持只读。`extensions` 整个只读，`category` 走阶段二迁移时一次性写入，编辑台不提供改分类功能。
4. **words**：`content.length`（UTF-16 码元数，O(1)）——2026-09-16 终审定为**正式定义**：简单快速，与其他语言一致（Python `len(str)` 也是码元数），该量级下感知误差可忽略。**已知偏差（留档）**：含空白与标点，中文条目偏大约 15–45%（雷恩哈特条目 length=2385 vs CJK 1691）；草案示例的 `words: 1842` 经实测不存在（292 条按任何口径都不等于 1842），属示意值，不构成规格。
5. **幂等性**：update/bulk 保留可选 `idempotencyKey` 参数（与 data 对齐），不建专门机制（data 的幂等是进程内 LRU；update 语义天然幂等；SDK `call` 不自动重试）。
6. **缓存**：core 层缓存解析后卡对象，key 含内容哈希（避免 stat/read 竞态），按字节数设上限。
7. **限流**：`MAX_CALLS_PER_MINUTE` 30 → 300（编辑台高频写会触发 30/60s 静默丢弃，表现为"点了没反应"）；同步改 `docs/official/architecture/ui-sdk.md` 与 `spherse-use-ui-sdk/SKILL.md` 的配额文案。
8. **错误码透传**：app handler 必须 `respond(ctx, false, { error: code })`（现有 `catch { respond(ctx, false) }` 会把 §5.3-6 错误码丢成通用 `spherse:error`）。

## 实施层级（5 层，仿 data 链路）

### 1. Contracts (`packages/contracts/src/card.ts`)

```typescript
// Request schemas
cardListRequest: { dir?: string }
cardMetaRequest: { path: string }
cardEntriesRequest: { path: string, filter?: { enabled?: boolean, constant?: boolean } }
cardSearchRequest: {
  path: string, query?: string,
  fields?: ("keys" | "secondary_keys" | "comment" | "content")[],
  onlyEnabled?: boolean, limit?: number, snippetChars?: number
}
cardEntryRequest: { path: string, id: number }
cardEntryManyRequest: { path: string, ids: number[] }
cardEntryUpdateRequest: {
  path: string, id: number,
  patch: Partial<EntryPatch>,
  idempotencyKey?: string
}
cardEntryBulkRequest: {
  path: string, ids: number[],
  patch: Partial<EntryPatch>,
  idempotencyKey?: string
}

// Response：裸值风格（与 data 链路一致，草案 §5.2 的 { ok: true, … } 信封不采用——respond 已包一层 ok）
// 错误码枚举（snake_case，对齐 data 链路 code 风格）
code: "card_not_found" | "entry_not_found" | "invalid_json" | "invalid_field"
    | "write_failed" | "forbidden" | "too_large" | "bad_request"

// EntryPatch 逐字段类型 + 值域校验（position 仅 before_char/after_char），非法 → invalid_field
```

白名单字段：`keys / secondary_keys / comment / content / constant / selective / insertion_order / enabled / position / use_regex`。

### 2. Core (`packages/core/src/capabilities/card/`)

```
card/
├── types.ts          # CardStore 接口 + 错误类（CardNotFoundError / EntryNotFoundError / InvalidFieldError / CardFileCorruptedError）
├── path-guard.ts     # resolveCardFile：resolveProjectPath + .card.json 后缀 + .spherse/ 禁入（仿 data path-guard.ts）
├── parser.ts         # parseCard(bytes)：JSON.parse + v3 形状校验（spec/spec_version/data.character_book.entries）+ 抽取条目
├── search.ts         # searchEntries（三档匹配 + use_regex 正则解释 + snippet；非法正则降级为字面量并标注）
├── cache.ts          # 解析后卡对象缓存：key 含内容 sha256（避免 stat/read 竞态），按字节数设上限
├── card-store.ts     # createCardStore(projectRoot, fileWriteMutex, logger)
└── index.ts          # 仅导出外部消费符号（CardStore 类型 + 错误类）
```

**CardStore 方法**：

- `list(dir?)` — 递归 walk（复用 `shouldSkipDirEntry` 语义：跳过 dotfile/node_modules/.git）找 `.card.json`，**逐项过读策略**（denied 目录不列出）；返回 `[{ path, name, entryCount, bytes }]`。
- `meta(path)` — `{ spec, name, entryCount, enabledCount, regexCount }`；`regexCount = data.extensions.regex_scripts.length`（沉沦法则实测 = 14），**不带正文**。
- `entries(path, filter?)` — `filter = { enabled?, constant? }`（覆盖编辑台 全部/启用/停用/常驻四档）；返回不含 content，`words = content.length`。
- `search(path, opts)` — 三档匹配（keys 精确 / comment 包含 / content snippet，`snippetChars` 默认 160）；`use_regex` 条目 `query` 按正则解释，非法正则降级字面量并标注；`onlyEnabled` 默认 true；`limit` 默认 20。
- `entry(path, id)` / `entryMany(path, ids[])` — 完整字段（含 content）。
- `updateEntry(path, id, patch, opts?)` / `bulkUpdate(path, ids[], patch, opts?)` — 锁内 load → 白名单 + 类型/值域校验（`invalid_field`）→ 应用 patch → `JSON.stringify(doc, null, 2)` → **与原字节相等则跳过写盘** → 否则 tmp 写 `.spcard.tmp` → `fs.rename` → 回读 `JSON.parse` 校验 → 失败回滚（删 tmp + 抛 `write_failed`）→ 失效缓存。

**写策略说明**：

- 放弃字符串手术：实测 `JSON.stringify(parsed, null, 2)` 与真实卡逐字节相等，未改动条目天然零 diff；无尾随换行。
- 20MB 上限检查（仿 DataStore `MAX_FILE_SIZE`），超限 → `too_large`。

### 3. Server (`packages/server/src/routes/card.ts`)

```typescript
POST /api/projects/:projectId/card/list
POST /api/projects/:projectId/card/meta
POST /api/projects/:projectId/card/entries
POST /api/projects/:projectId/card/search
POST /api/projects/:projectId/card/entry
POST /api/projects/:projectId/card/entry/many
POST /api/projects/:projectId/card/entry/update
POST /api/projects/:projectId/card/entry/bulk
```

路由逻辑：

- 从 `ProjectRegistry` 取 `CardStore`（`factory.ts` 创建单例，经 `project-runtime.ts` 挂 `runtime.cardStore`，与 DataStore 同级；`defaultCapabilities` 改 options 对象传参，避免位置参数堆积）。
- 参数 `parseContract` 校验；`.card.json` 后缀前置校验在 store 内统一（`resolveCardFile`）；`list` 的 denied 过滤 store 支持注入式 `canRead`，生产环境由 server 路由层执行。
- 读操作过 `serverAccessPolicy.assertRead`，写操作过 `assertWrite`（`list` 的 walk 已在 store 内过滤，路由层不再重复）。
- 调 `CardStore` 方法；错误映射 `sendCardError`（仿 `sendDataError`）。

### 4. App (`packages/app/src/`)

```
ui-sdk/handlers/card.ts   — registerAction("card.list/meta/entries/…")，薄代理 + 转发 error code
ui-sdk/index.ts           — import "./handlers/card" (barrel)
ui-sdk/rate-limit.ts      — MAX_CALLS_PER_MINUTE 30 → 300（编辑台高频写需求；同步改两处配额文案）
lib/api.ts                — ApiClient.cardList/cardMeta/cardEntries/cardSearch/cardEntry/cardEntryMany/cardEntryUpdate/cardEntryBulk
```

handler 薄代理（错误码必须透传，区别于 data handler 的 `catch { respond(ctx, false) }`）：

```typescript
registerAction("card.list", async (params, ctx) => {
  const { dir } = params as { dir?: unknown };
  if (!ctx.client) return;
  try {
    const r = await ctx.client.cardList(typeof dir === "string" ? dir : undefined);
    respond(ctx, true, r);
  } catch (e) {
    respond(ctx, false, { error: e instanceof ApiError ? e.message : "request_failed" });
  }
});
// 其余 7 个同构
```

### 5. SDK (`packages/sdk/src/runtime/card.ts`)

```typescript
export const card = {
  list: (params) => call("card.list", params),
  meta: (params) => call("card.meta", params),
  entries: (params) => call("card.entries", params),
  search: (params) => call("card.search", params),
  entry: (params) => call("card.entry", params),
  many: (params) => call("card.entry.many", params),
  update: (params) => call("card.entry.update", params),
  bulk: (params) => call("card.entry.bulk", params),
};
```

组装进 `window.spherse`（`runtime/index.ts:40-54` 扩展）。

## 实施 Task 顺序（详见 `plan.md`）

1. **contracts** — schema + 错误码 + 聚合 index
2. **core card 域** — path-guard + parser + cache + search + CardStore 读方法 + 单测
3. **core 写方法** — reserialize + 等价短路 + tmp+rename + 回滚 + 单测（含并发）
4. **装配** — `factory.ts` + `project-runtime.ts` + `defaultCapabilities` 改 options 对象
5. **server routes** — card.ts 路由 + sendCardError + 注册；**ApiClient** 补方法
6. **app + sdk** — `handlers/card.ts`（错误码透传）+ barrel + 配额 300 + `runtime/card.ts` + 组装 + 打包验证
7. **skill 文档** — spherse-use-ui-sdk 补 card.* 一节 + 配额文案同步
8. **verify 全量** — lint + build + typecheck + 单测 + 手测大卡延迟

## 验证清单

- contracts 单测：各 request schema 正向/负向（缺 `path`、非法 `fields`/`position`、非 `.card.json` 形状）。
- core 单测：解析容错（撕裂 JSON → `invalid_json`）、三档匹配 + `use_regex` 非法正则降级、缓存命中/失效、list 策略拒绝（denied 目录不列出）。
- core 写单测：原子性（rename 前异常原文件不变）、回滚（回读校验失败删 tmp）、等价短路（无变化不写盘）、50 并发无丢失、白名单拒绝（`id`/`extensions` → `invalid_field`）。
- server 契约测试：真 PM 装配 route 测试至少一条 round-trip（entry.update 落盘 + 回读断言），不 mock 被测方法本身（仓库红线）。
- app 单测：handler 薄代理 + 错误码透传 + 配额行为（仿 `handlers/data.test.ts` 模式）。
- sdk 单测：`call("card.*")` 动作名与参数透传。
- 手动：沉沦法则级大卡（292 条）list/meta/entries/search 延迟实测；外部改动触发 `file:update` 重拉；写后 git diff 确认未改条目零 diff。

---

## 附：二期（add/remove）与 Agent 内置工具（2026-09-16 已实施，未 commit）

> 终审决策（2026-09-16）：**Agent 工具与 add/remove 一起做**——`edit_card` 直接支持 update/bulk/add/remove 四操作（扁平 `action` 分支），一次性完成，不分两批。
> 审查修订（2026-09-16 code review）：多动作工具一律用 `action: Type.Union([...Literal])`（`manage-trigger.ts:10-22`、`manage-agent.ts:9`、`manage-project-config.ts:7` 三处先例），不用 `op`；`add` 的 entry 体用**显式 optional 字段**，禁用 `Type.Record(String, Unknown())`（`additionalProperties: {}` 会触发严格 schema 中转 400，见 `docs/dev/bugfix/2026-09-14-gemini-relay-400/design.md`）。

### Agent 工具装配链（5 步，与 data 工具同构）

1. `packages/core/src/capabilities/card/tools.ts` [新增]：`createReadCardTool / createSearchCardTool / createEditCardTool` 工厂 `(cardStore, getPolicy)`，仿 `capabilities/data/tools.ts:55-150`（TypeBox 参数 + `execute` 内 `assertRead/assertWrite` + 错误转文本，仿 `errorText` 风格）。多动作工具参数形态：`read_card`（`action: list|meta|entries|entry|many`）与 `edit_card`（`action: update|bulk|add|remove`）均为**扁平 `action` + 全 optional 参数**（仿 `manage-trigger.ts:10-22`），禁用 union-of-object 与 `Record(String, Unknown())`（严格 provider 风险）；`add` 带可选 `idempotencyKey`（与 `data.mutate` 对齐，add 非幂等）。
2. `packages/core/src/capabilities/card/capability.ts` [新增]：`cardCapability(shared?)`，仿 `data/capability.ts:8-26`（`id: "card"`，`tools: (host) => [...]`，`llmPolicyOf(host)` 取策略，未传 shared 时懒建 own store）。
3. `packages/core/src/capabilities/builtin.ts` [修改]：`builtinToolCapabilities` 签名改 **options 对象**（`{ dataStore?, cardStore? }`，不新增位置参数——刚在 `defaultCapabilities` 修掉同类问题），注册 `cardCapability(...)`；`factory.ts` 调用行同步。
4. `packages/presets/templates/agent-template.md` + `packages/presets/templates/preset-agents/assistant.md` [修改]：`tools:` 加 `read_card / search_card / edit_card`（显式清单，不加则 agent 不可见；profile `tools` 白名单过滤见 `session/agent-assembly.ts:168-169`）。**存量 agent 不自动获得新工具**：模板只惠及新建 agent，用户现有项目（含 10 个游戏项目）的 agent .md 需手动加三名（`manage_agent` 或直接编辑），设计不含批量迁移。
5. `toolCatalog` 自动收敛（`agent-assembly.ts:164-166` 从 capability tools 聚合，无需手动注册，`manage_agent` 名称校验自动通过）。

关键差异（页面通道 vs Agent 通道）：工具**直调 `CardStore` 进程内方法**（仿 data 工具直调 `dataStore`，不走 HTTP）；策略走 `llmPolicyOf`（`LLM_READ/WRITE` 集合），与路由层的 `serverAccessPolicy`（`SRV_*`）规则集不同，denied 行为以各自为准。工具返回仿 data：`content: [{ type: "text", text: jsonBlock(result) }]` + `details: { path, ... }`（card 无 version，details 带 `id` 即可）。上下文纪律沿草案 §7：先 `search` 再 `entry` 取全文，不整卡读取。

审批说明：`edit_card` **不挂** `withApproval`——该包装只用于管理类工具（`agent-mgmt/index.ts:9`、`trigger/index.ts:47`、`interaction/index.ts:10`），fs 写工具（`write_file/edit_file/move_file`，`fs/index.ts:18-26`）不挂；card 编辑属文件写，与 fs 同例。

工具切分建议：草案定三件（`read_card` 覆盖 list/meta/entries/entry/many、`search_card`、`edit_card` 覆盖 update/bulk/add/remove），与 data 的 read/query/mutate 三分法同构，保留（不合并），减少单工具参数分叉；多动作一律扁平 `action`（见上条终审修订）。

### 二期 add/remove：id 实测推翻草案担忧

沉沦法则 292 条实测：`id` 唯一，0–263 连续 + 28 个稀疏大 id（最大 995533，SillyTavern 后加条目的随机分配）。结论：

- `id` 是**不透明唯一号**，无需连续、无需排序；草案 §10-3"新增/删除后重编号"担忧解除——**永远不重编号**。
- `add`：新 id 取 `max+1`（定死，唯一故碰撞不可能；空表时 `max` 取 -1 → 首 id 为 0），**id 分配必须在 `fileWriteMutex` 内**（否则并发 add 同 id 丢条目）；新 entry 追加到 `entries` 末尾（`insertion_order` 由调用方指定，不自动重排）。
- `remove`：按 `id` splice 单条，其余条目零触碰。
- reserialize 策略下 add/remove 是纯数组操作，零额外成本（再次确认放弃字符串手术正确）。
- 白名单：`add` 的 entry 体为写白名单 10 字段的**显式 optional 字段**（禁用 Record，见上条终审修订）；`extensions` 强制 `{}`（不接受外部传入，保持只读；`category` 不开口子，仅由阶段二迁移脚本写入）；缺省字段补默认值后按固定键序写出 canonical 12 字段（`id, keys, secondary_keys, comment, content, constant, selective, insertion_order, enabled, position, use_regex, extensions`）。
- 命名：`card.entry.add` / `card.entry.remove`（与既有 dotted 风格一致）；store 方法 `addEntry(path, entry) → { id }` / `removeEntry(path, id) → { ok }`；server 路由 `POST /card/entry/add|remove`；sdk `card.add/card.remove`；handler 薄代理同构。
- Agent 侧：add/remove 并入 `edit_card`（扁平 `action: update|bulk|add|remove`），不新增第四工具。
- 写路径复用：从 `applyPatchLocked` 抽出 `withLockedDoc(absPath, rel, mutate)`（锁内 read→parse→改→reserialize→等价短路→tmp+rename→回读→失效缓存），update/bulk/add/remove 共用，不复制三条写路径。

### 二期实施顺序（8 步，2026-09-16 终审 + code review 修订）

1. **core 写路径重构 + add/remove**：抽 `withLockedDoc`，加 `addEntry(path, entry) → { id }`（id 锁内 `max+1`）/ `removeEntry(path, id) → { ok }` + t3 测试（**并发 add 无同 id**为关键不变量）。
2. **contracts 补 schema**：`CardAddRequest/Response` / `CardRemoveRequest/Response`（显式字段）+ 单测。
3. **server 补路由**：`card.ts` 加 `POST /card/entry/add|remove`（`assertWrite`）+ 契约测试。
4. **sdk 补方法**：`card.add(...)` / `card.remove(...)` + 单测。
5. **app 补 handler**：`card.entry.add` / `card.entry.remove` 薄代理 + 单测。
6. **core 补工具**：`tools.ts` 三工厂（扁平 `action`）+ `capability.ts` + `builtin.ts` 改 options 对象 + `factory.ts` 调用行 + t5 风格单测（policy deny + 成功路径文本）。
7. **两模板改 tools 清单**：`agent-template.md` + `preset-agents/assistant.md` 加三名；`npm run build -w packages/presets`（sync 产物含三名即过）。
8. **doc-sync + verify**：`capabilities.md:20` 工具表加 card 一行、`:83` 补 CardStore 暴露段、agent 可见的使用纪律落点（草案 §7）+ `npm run verify`（lint/build/typecheck/单测/i18n）。

### 二期验证思路

- core：add 后 id 唯一且落盘可读、remove 后 JSON 深等（除被删条目外全同；reserialize 整份重写故不断言逐字节）、对不存在 id remove → `entry_not_found`。
- server：add/remove round-trip + 非法枚举/类型 → 400；`id`/`extensions` 经网关剥离（200 空操作），store/工具层纵深拒绝。
- Agent 工具单测仿 `capabilities/data/t5-tools.test.ts`（policy deny + 成功路径 `content[0].text` 含 JSON block）。
- app/sdk 单测：add/remove 薄代理 + 错误码透传 + 参数透传。
