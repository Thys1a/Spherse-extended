# data.query 打通 + card/data 缺口修复设计

- 日期：2026-10-22
- 状态：设计已定，待实现
- 来源：2026-10-22 三次现状调研（card 读取 op / search 工具 / card 字段全景）＋ agent 整卡直读行为调查 ＋ ST 兼容分档决策
- 关联：`../2026-10-12-worldbook-position/positions-card-op.md` §2.2（T1/T2 已决）、§3.2（agent 卡目录方案）

## 一、总览

做六件事，各自一个 commit，按顺序实施：

| # | 内容 | 实施节 | 性质 |
|---|---|---|---|
| P1 | agent 整卡直读修复 | §3.1 | 纯工具文案 |
| P2 | `DataStore.query` 打通到 HTTP / client / SDK | §3.2 | 只读暴露，无新语义 |
| P3 | card 摘要补齐匹配字段 | §3.3 | 加字段，payload 微增 |
| T1 | `extensions` 写开放（浅合并＋`null` 删键） | §3.4 | 含既有断言反转 |
| T2 | 新增顶层 `case_sensitive` 可写字段 | §3.5 | 唯一新增的运行时语义 |
| P4 | skill 文档澄清 `data.entries` 全量下载 | §3.6 | 只改文档 |

文档同步清单见 §四；明确不做见 §五；验收见 §六。

## 二、现状结论（调研沉淀，实现时不再重查）

### 2.1 card 内容目录：五层全通，无缺口

`read_card action=entries`（`tools.ts:84`）→ `CardStore.entries(path, filter?)`（`types.ts:104-107`）→ `POST /card/entries`（`routes/card.ts:83-102`）→ `client.cardEntries`（`api.ts:324-335`）→ `card.entries`（`handlers/card.ts:41-60`）。`CardEntrySummary` 即目录形态（无 `content`）。唯一例外是 `.spherse/` agent 卡（四层硬隔离，by design）。

### 2.2 data.json 内容目录：outline 有，轻量 keys 接口无

- **outline 即目录**：`read_data` 不带 key/path 即返回结构摘要（类型描述 + 数组枚举探针 + manifest 章节，无值，超长截断，`data-store.ts:542-544` → `outline.ts:162-206`），带内容哈希缓存（`data-store.ts:515-518`）。“先看结构再精确读”工作流成立，无缺口。
- **keys/entries 是全量下载**：SDK `data.keys`/`data.entries` 实为 `dataRead({path:"."})` 取整文档后客户端取键（`handlers/data.ts:117-142`）；`entries` 之名误导——返回**全文**而非目录。
- **缺口（暂不补）**：无服务端轻量 keys-only 接口；触发条件为“outline 不够用且大文件 keys 成瓶颈”。

### 2.3 搜索现状

- `search_content` **搜文件内部**（行级子串，`tools/search-content.ts:95`），不是文件名；能命中 `.card.json`/`.data.json` 原始文本（行号 + 截断行，无 entry 语义），默认跳过 `.spherse`，仅 Agent 工具可用。
- **card** 内容搜索单文件三路齐全（`search_card` + `card/search` + `card.search`），默认 `keys+comment`、默认只看 `enabled`；无跨卡、无全文返回（需二次 `read_card entry`）。
- **data** 侧只有精确读（`read_data`）和具名精确查（`query_data`）；**`DataStore.query` 存在但 HTTP/UI 双缺**：`routes/data.ts` 仅 read/mutate/raw-set/raw-delete 4 条，`contracts/data.ts` 无 query schema，`api.ts` 无 `dataQuery`，ui-sdk 无 `data.query`（`handlers/data.ts:27-142` 仅 get/set/delete/mutate/keys/entries，其中 keys/entries 是全读再取键）。

### 2.4 card 字段现状（含本次变更后状态，标 P3/T1/T2 处见实施节）

不对称有四处：① `secondary_keys/selective/use_regex` 参与匹配但摘要/搜索不可见（P3 补齐）；② `content` 搜索仅 snippet；③ `extensions` 单条可见、多条/搜索不可见（T1 写开放后“写拒绝/add 清零”解除）；④ `update/bulk` 存活的自定义顶层键读时丢弃。

| 字段 | 读 | 写 | 搜索可见 | 运行时消费 |
| --- | --- | --- | --- | --- |
| id/keys/constant/enabled/insertion_order | ✅ | ✅ | ✅ | ✅ |
| secondary_keys | ✅ | ✅ | ◐（只记 matched:["keys"]，P3 后可见原文） | ✅ |
| comment | ✅ | ✅ | ✅ | ❌（纯给人看） |
| content | ✅ | ✅ | ◐（仅 snippet 片段） | ✅（渲染唯一载荷） |
| selective/use_regex | ✅ | ✅ | ❌（P3 后 ✅） | ✅ |
| case_sensitive | ❌（新增，T2） | ❌（新增，T2） | ✅（随摘要，T2） | ✅（仅 matchKeys，T2） |
| position/depth | ✅（旧串归一 3） | ✅（跨字段校验） | ✅ | ◐（0/1 走 system hook，2/3/4 走 projector） |
| words | ✅（实为字符数） | ❌ | ✅ | ❌ |
| extensions | ◐（单条可见，多条/搜索不可见） | ❌（T1 后 ✅ 浅合并） | ❌ | ❌ |
| name/priority/group*/probability*/scan_depth/递归/automation_id 等其余 ST 字段 | ❌（读即丢或困在 extensions 黑盒） | ❌ | ❌ | ❌ |

### 2.5 agent 整卡直读成因（现象＋四环，修法见 §3.1）

现象：找“某项”时 agent 经常绕开 `entries`/`search`，直接 `read_file` 整卡（超 32KB 还用 offset 分页读完）。

1. **牌子挂错地方**：`read_file` description（`tools/read-file.ts:45-46`）对 `.card.json` 只字不提；“Never read the raw file”写在 `READ_CARD_GUIDE` 里（`card/tools.ts:18`）——模型只有在已考虑 `read_card` 时才看得到。
2. **分页机制主动邀请读完**：description 明示 32KB cap + offset/limit 分页（`read-file.ts:31,46`），超限卡必然被逐页翻完。
3. **`search_content` 帮倒忙**：返回断裂的 JSON 行（单行 500 字符截断，`output-limits.ts:4-9`），模型拿到碎片后理性选择“打开原文自己找”。
4. **权限组是独立变量**：read / data / card 是三个独立权限组（`tool-registry.ts:15,25,30`）；没开 card/data 组的 agent 只能用 `read_file`。P1 文案须写成条件式（“if available”），不对无组 agent 做假设。


### 2.6 ST 兼容分档（已决，明细见 `positions-card-op.md` §2.2）

前提：`update`/`bulk` 在原始 JSON 上原地改键（`card-store.ts:402-407`），ST 顶层字段与整个 `extensions` 在磁盘上不丢（`t3:89` 已验证）；丢的是内存视图（`normalizeEntry` 只取认识的字段）和 `add` 路径（`extensions` 恒 `{}`）。

- T1（做）：`extensions` 写开放，浅合并＋`null` 删键。
- T2（做）：新增顶层 `case_sensitive` 可写字段，回退读 `extensions.caseSensitive`，只作用于 `matchKeys`。
- T2'（不做）：ST 位置映射（depth 口径有损）与条目级 `scan_depth`；ST 卡统一按默认插入点 3 注入。
- T3（不做）：`probability`/`group*`/递归/`sticky/cooldown/delay`/`role`/outlet/`match_whole_words`/`vectorized`/`automation_id`。
- `spherse_` 前缀保留规则现在不定。

## 三、实施方案

### 3.1 P1 整卡直读修复（纯文案，单独 commit）

- `core/src/tools/read-file.ts` description：照 binary→`render_card` 写法加条件式重定向——“`.card.json` 若有 card 工具可用，用 `read_card`（先 `entries`/`search_card` 定位再 `entry` 取全文）或 `search_card`；`.data.json` 若有 data 工具可用，用 `read_data`（不带 path 先看 outline）；不要直接打开或分页读完”。
- `core/src/capabilities/card/tools.ts` `READ_CARD_GUIDE`：平铺动作列表改成工作流——“找条目：1. `search_card` 或 `entries` 定位 id → 2. `entry`/`many` 取全文；不要读原始文件”。
- `core/src/tools/search-content.ts` description：补一句——命中 `.card.json`/`.data.json` 时只返回原始 JSON 片段，要条目语义改用 `search_card`/`read_data`（若可用）。
- 验证：`npm test --workspace=packages/core`（无测试断言 description 全文，无需同步）。

### 3.2 P2 data.query 打通（单独 commit）

**contracts**（`contracts/src/data.ts`）：新增 `dataQueryRequest/Response`，字段与 core `QueryResult`（`data/types.ts:159-168`）一一对应；`limit` 上限 100 与工具侧一致（`tools.ts:85`）。

```ts
export const dataQueryRequest = Type.Object({
  file: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
  params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  after: Type.Optional(Type.String({ minLength: 1 })),
});

export const dataQueryResponse = Type.Object({
  version: Type.String(),
  value: Type.Unknown(),
  total: Type.Integer({ minimum: 0 }),
  count: Type.Integer({ minimum: 0 }),
  pagination: Type.Union([Type.Literal("cursor"), Type.Literal("offset-drift")]),
  nextAfter: Type.Optional(Type.String()),
  truncatedItems: Type.Optional(Type.Array(Type.Integer())),
  note: Type.Optional(Type.String()),
});
```

**server**（`server/src/routes/data.ts`）：新增 `POST /api/projects/:projectId/data/query`，照抄 `data/read` 路由形态：`parseContract` → `store.query(file, name, params ?? {}, {limit?, after?})` → 200。错误走现有 `sendDataError`（`DataValidationError`→400、`UnknownEntryError`→404、`ManifestStaleError`→409 已覆盖，无需新分支）。注意：非法 `after` 在 core 是**静默返回空页**（`query-engine.ts:108-111`），不是 400。权限与现有 4 条一致，不新增检查（只读）。

**app client**（`app/src/lib/api.ts`）：新增 `dataQuery(params)`，照抄 `dataMutate`（`api.ts:267-282`）：`parseJsonResponse(res, schemas.dataQueryResponse)`。

**UI SDK**（`app/src/ui-sdk/handlers/data.ts` + `sdk/src/runtime/data.ts`）：新增 `data.query` action，照抄 `data.mutate`（`handlers/data.ts:92-115`）：`validateFileParam` 复用；`name` 非空校验；`params` 仅透传 plain object；`limit/after` 透传；`dockedSessionId` 透传；**返回完整 `QueryResult` 整包**（不是 `r.value`——页面翻页需要 `nextAfter/total`）。SDK 加一行 `query: (params) => call("data.query", params)`。`data.query` 进限流白名单（只读，与 `data.get` 同档，见 §四）。

**测试**：contracts 加 `dataQueryRequest/Response` 正样本 + 非法 `limit`/缺 `name` 负样本；server `data-routes.test.ts` 加往返（命中 + 未知 query 名 404 + 非法 params 400 + 非法 `after` 返回 200 空页）；app `ui-sdk/handlers/data.test.ts` 加透传用例（含整包返回）。

### 3.3 P3 摘要补匹配字段（单独 commit）

`CardEntrySummary` 加 `secondary_keys/selective/use_regex`（`card/types.ts:32-42`）。类型上 `CardSearchHit` 自动继承，但三处组装需显式补值：`card-store.ts`（`toSummary`）、`search.ts`（`out.push` `:104-117`）、`contracts/card.ts`（`cardEntrySummary` `:35-45` 与 `cardSearchResponse.results` 内联 schema `:120-135` 两处）。代价：每条多十几个 token；app/contracts 里 `toEqual` 断言会碎，属预期。对应测试补字段断言。

### 3.4 T1 extensions 写开放（单独 commit）

- `contracts/card.ts`：`entryPatch` 加 `extensions: Type.Optional(Type.Record(Type.String(), Type.Unknown()))`。注意 `entryPatch` 被 update/bulk/add 三条路径共用（`:150,160,168`），即三条路径同时开放；顶层 `extensions: null` 拒绝（Record 要求对象），只允许键值级 `null`（删键）。
- `card-store.ts`：`validatePatch` 加 `extensions` 对象校验；`update`/`bulk` 对 `extensions` 做浅合并（只覆盖给出键，`null` 删键；整体替换会抹 ST 原有键，不采用）；合并底值规则——已有值为 plain object 则在其上合并，否则以 `{}` 为底（脏值静默兼容，不报 400）；`changed` 比较**合并结果 vs 原值**（`bulk` 维持现状无比较）；`canonicalEntry` 保留传入的 `extensions`（缺省 `{}`）；仍拒绝顶层未知键。
- 类型收窄：`CardEntry.extensions` 由 `unknown` 收窄为 `Record<string, unknown>`；契约 `cardEntry.extensions` 由 `Type.Unknown()` 收窄为 Record。
- `tools.ts`：工具 schema 加字段；`EDIT_CARD_GUIDE`（`:27`）去掉“extensions 只读”，写明合并语义；`errorText` 可写清单（`:43`）加 `extensions`。
- **既有断言反转**（T1 会直接打红，不改过不了）：core `t3-card-store-write.test.ts:100-105`（update 拒 extensions）、`:254-258`（add 拒 extensions）；contracts `card.test.ts:127-133`（bulk 拒）、`:177-182`（add 拒）。
- 新增测试：合并不丢原有键、`null` 删键、脏值（非对象）兼容、`add` 保留、undo 回滚。

### 3.5 T2 case_sensitive（单独 commit）

- 新增**顶层可写字段** `case_sensitive`（boolean，缺省 `false`，现状行为不变）：`EntryPatch`、`WRITABLE_FIELDS`、`canonicalEntry` 缺省、`validatePatch` 布尔校验、contracts `entryPatch`/`cardEntry`/summary＋search results schema、工具 schema。
- **回退读** `extensions.caseSensitive`（ST 原 camelCase 名）：顶层优先，缺省 false。只读不写——ST 数据经此进入运行时，不回写。
- **作用域**：只作用于 `matchKeys`（含正向与反向包含；`use_regex` 分支本来大小写敏感，不变）；不影响 `search` 的 comment/content 匹配（仍大小写不敏感）。
- `normalizeEntry` 解析；projector 无需改（经 `matchKeys` 生效）。
- 测试：`true/false` 两种取值＋camelCase 回退。

### 3.6 P4 skill 文档澄清（单独 commit）

`presets/skills/spherse-use-ui-sdk` 写明 `data.entries` 返回整份文档（全量下载），大文件先用 `data.get` 无 key（outline）；改完执行 presets build。

## 四、文档同步清单（随对应 commit 做）

| 事项 | 文件 | 改动 |
|---|---|---|
| data 路由表 | `docs/official/architecture/server.md:54` | 加 `/query` |
| data 端点数 | `docs/official/architecture/server.md:100-103` | “4 个”→“5 个”，注明 query 只读 |
| data 路由数 | `packages/server/README.md:47` | “四个”→“五个” |
| SDK action 列表 | `docs/official/architecture/ui-sdk.md:23,51` | 加 `data.query` |
| 限流白名单 | `docs/official/architecture/ui-sdk.md:40` | 加 `data.query`（只读，与 `data.get` 同档） |
| extensions 只读说法 | `docs/official/data-conventions.md:264` | 改为浅合并可写 |

## 五、明确不做（触发条件）

| 缺口 | 触发条件 | 预计改动面 |
|---|---|---|
| C：`read_file` 执行期拒 `.card.json` | 文案无效、整卡直读依旧时 | 执行期拦截＋指引；先确认无组 agent 的诉求 |
| 跨卡全文搜索 | 世界书管理 UI 需要全局检索时 | core `CardStore.searchAll`（walk＋聚合）→ contracts → server → app → SDK，约 9 文件 |
| data 子串/全文搜索 | 有“内容召回”而非“精确查询”需求时 | `query-engine.ts` 加 `contains/regex` 操作符＋`validate.ts` 加 param 类型，二阶段 |
| `search_content` HTTP/UI 暴露 | 前端/HTML 需要通用文件搜索时 | 新路由＋schema＋client＋`api.call` 白名单；先评审权限/限流 |
| ST T2'/T3 | ST 卡位置保真 / 概率组递归等语义需求 | 位置映射表（先对照 ST 源码核实枚举）或组选/递归/跨轮状态，单独 design |
| 轻量 keys-only 接口 | outline 不够用且大文件 keys 成瓶颈时 | outline 缓存复用或 `data/read` 加 `keysOnly` 模式 |
| agent 世界书卡目录 | 世界书管理 UI 立项时 | 见 `positions-card-op.md` §3.2 方案 A |
| 顶层自定义字段 `meta.custom` | 世界书管理 UI 需要展示卡级自定义时 | `meta` 加 `custom?: Record` 透传 |

## 六、验收

1. P2 `data.query` 五层贯通各有一条用例（contracts 正/负、server 往返含非法 `after` 空页、handler 透传整包）。
2. P1 人工场景：让 agent 在测试卡中找某条目，检查 tool trace 是否仍 `read_file` 整卡。
3. P3/T1/T2 对应测试更新或新增（含 §3.4 既有断言反转四处）。
4. 六个 commit 按 P1 → P2 → P3 → T1 → T2 → P4 顺序各自提交（P3 与 T1/T2 先后改 `contracts/card.ts`，按序 rebase）。
5. `npm run verify` 通过。
6. 不新增 `FileWriteMutex`、不碰 `.spherse` 放行规则、不改 manifest 语义。
