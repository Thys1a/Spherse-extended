# 多注入位置点 / card.json 字段开放 / card 目录新 op 可行性调研

目录：`docs/dev/features/2026-10-20-worldbook-positions/`｜分支：`feat/worldbook-injection-x7q2`
关联：`../2026-10-20-worldbook-injection/research.md`（v1.0.2 预算＋位置修正，P1 即该项）。
范围：只调研可行性，不产出 design；实现前需评审。

## 一、多注入位置点（供用户选择）

### 1.1 候选位置与可行性

| 位置点 | 语义 | 可行性 | 说明 |
|---|---|---|---|
| P0 `after_current_user`（现状） | wb 在 wire 末尾 | ✅ 零改动，保留为可选项 | 与 P1 二选一，不是删除 |
| P1 `before_current_user` | wb 插到末条 user 之前 | ✅ 已验证（见关联 research §二） | v1.0.2 位置项即此；建议新默认 |
| P2 历史锚点（depth N） | 同 user 身份往历史深处插 | ✅ 便宜，纯函数定位 | P0/P1 的推广：N=0 即 P0（末尾），N=1 即 P1（末条之前）。**N 按 user segment 数**（照抄 `pruning-projector.ts:17-19` 计数，`role==="user"` 才 +1），插入点为“倒数第 N 个 user 段的段首（某条 user 消息）之前”，`slice` 即可；N 存哪（entry 字段 vs agent 默认）待定；ST 语义的子集，不用全抄 depth/role。规则：**插入点恒选段首，永不切开 `assistant(toolCall) → toolResult` 对子**（按 raw 条数数 N 会劈到对子，不采用） |
| P3a system-role 消息 | messages 数组里塞 system 身份 | ❌ 成本高 | pi-ai `Message = User \| Assistant \| ToolResult`（无 system 成员），`convertToLlm` role filter（`agent-assembly.ts:252-254`）只是该联合类型的镜像；放行需改上游 pi-ai + pi-agent-core + 各 provider 分发，06 §五否决对本项成立 |
| P3b `system`（systemPrompt 尾） | `<worldbook>` 追加到 systemPrompt 尾 | ✅ 便宜，有 MCP 先例 | `Context.systemPrompt?: string` 已抽象各家 system 差异，无新增 provider 风险；`contextBlocks` 只跑一次不够动态，需走 `turnHooks.beforeTurn`（读 `agent.state.messages` → 匹配 → strip 旧块 → append，抄 `capabilities/mcp/index.ts:84-88` 的 RE 剥离模式）；与 MCP 块的尾部相对顺序＋cache 实测见 §四新增决策点 |
| P4 assistant 身份伪装 | wb 扮 assistant 消息 | ❌ 不建议 | wire-only 不污染持久化，但模型看到伪造 assistant 发言；fold/重放语义混乱，收益不明 |

结论：开放 **P0 / P1 / P2 / P3b** 四档覆盖“用户选择注入位置”的诉求；P3a/P4 明确不做。P0/P1/P2 是同一 user 身份在 messages 数组里换下标， attention 沿“队尾最强 → 段首渐弱”形成一条渐变轴（一路弱到 messages 最前时效果接近 P3b）；缺省建议仍为 P1（取中间值，system 作 opt-in，attention 强弱待 tuning 实测）。

### 1.2 存储：复用 entry `position` 字段

- 现状：parser 按自由字符串解析（`parser.ts:35`，缺省 `""`）；写侧校验收紧为 `before_char | after_char`（`card-store.ts:77-79`）；projector **完全忽略**（tuning doc：首版不映射）。
- 方案：扩展 `position` 枚举（`types.ts:13` `CardPosition`）为 `before_char | after_char | before_current_user | after_current_user | history_depth_N | system`（`system` 即 P3b；depth 值另存字段或编码后缀，二选一，design 时定）。写校验（`validatePatch`）、`canonicalEntry` 缺省（现缺省 `after_char`，:102——改缺省即改新默认，需与 v1.0.2 位置项对齐）、读解析三处同改。
- projector 按 position 分组：同位置条目合一个块；多位置命中 → 多个 user 块。注意每个 user 块 +1 个 user segment（剪枝计数影响，见关联 research §2.2），design 时定上限（建议不同位置块总数 ≤3）；**P3b 块走 systemPrompt，不占 user segment**，`KEEP_RECENT_SEGMENTS=5` 剪枝边界会随之移动（多保留一轮 toolResult 全文），测试需钉住该行为差异。
- agent 级默认位置（profile 字段）暂不做：entry 级已够表达；profile 动 schema＋装配＋i18n，留待真有人抱怨“逐条设太烦”再说。

## 二、card.json 字段：自定义与内定

### 2.1 现状（读/写不对称）

- 读：`normalizeEntry`（`parser.ts:21-40`）只取 10 个已知字段＋`extensions: raw.extensions ?? {}`（内存保留）；顶层 doc 其他字段保留在 `ParsedCard.doc`。
- 写：`updateEntry`/`bulkUpdate` 在原始 doc 上原地改键（`card-store.ts:384-393`）——**外部预置的自定义键能存活**；但 `addEntry` 经 `canonicalEntry`（:91-106）重建，自定义键被丢弃、`extensions` 恒 `{}`；`validatePatch`（:51-85）拒绝一切非白名单键。
- 读 API：`entry` 返回解析后 `CardEntry`（`extensions` 可见）；`entries`/`search` 返回摘要（`extensions` 不可见）；`meta` 不暴露顶层自定义字段。

### 2.2 方案（2026-10-22 已决）

- **T1 extensions 可写（做）**：`validatePatch` 加 `extensions` 为 record 校验；`update`/`bulk` 对 `extensions` 做**浅合并**（只覆盖给出的键，值为 `null` 表示删除该键，整体替换会抹掉 ST 原有键故不采用）；`canonicalEntry` 保留传入的 `extensions`（`add` 不再清零）；仍拒绝顶层未知键。undo 存整条目（`structuredClone`，:397-401），回滚天然兼容；worldbook 渲染与搜索忽略 `extensions`，零副作用。
- **T2 `case_sensitive`（做）**：新增**顶层可写字段**（boolean，缺省 `false`，现状行为不变），进 `WRITABLE_FIELDS`/`entryPatch`/工具 schema；**回退读** `extensions.caseSensitive`（ST 原 camelCase 名，顶层优先，只读不写）；只作用于 `matchKeys`（含正反包含，`use_regex` 分支本来敏感），不影响 search 的 comment/content。
- **T2' ST 位置映射（不做）**：ST 的 depth 按消息条数、我方 depth 按用户回合，有损；**ST 卡统一按默认插入点 3 注入**。条目级 `scan_depth` 同不同。
- **T3 其余运行时语义（不做）**：`probability`（工具循环内忽有忽无、破坏缓存）、`group*`（组选算法）、递归扫描、`sticky/cooldown/delay`（跨轮状态，与无状态 projector 冲突）、`role`/outlet、`match_whole_words`（中文无词边界）、`vectorized`、`automation_id`。数据在磁盘上不丢（`update`/`bulk` 原地改键，见 §2.1），运行时不认。
- **`spherse_` 保留规则（现在不定）**：等真有平台字段要放 `extensions` 时再定。
- **顶层自定义字段**：写侧已保留、可读侧缺 `meta` 暴露；如世界书管理 UI 需要展示（如卡级默认位置），design 时给 `meta` 加一个 `custom?: Record` 透传，成本极小。本次可先不做。

## 三、card 内容目录：项目卡无缺口，agent 卡待 UI 立项

### 3.1 更正：path → card 内容目录五层全通，无需新 op

2026-10-22 复核结论：`read_card action=entries` 即“给定 path 列条目目录”（`tools.ts:84` 原文 `"entries: entry list without content"`），以下五层一一对应，全部已存在：

| 层 | 通道 | 返回 |
|---|---|---|
| agent 工具 | `read_card entries`（`tools.ts:151-152`） | `CardEntrySummary[]` |
| core | `CardStore.entries(path, filter?)`（`types.ts:104-107`） | 同上，`filter{enabled?, constant?}` |
| server | `POST /card/entries`（`routes/card.ts:83-102`） | 同上 |
| app | `client.cardEntries(path, filter?)`（`api.ts:324-335`） | 同上 |
| SDK | `card.entries`（`handlers/card.ts:41-60`） | 同上 |

`CardEntrySummary`（`types.ts:32-42`）即目录形态：`id/comment/keys/constant/enabled/position/depth?/insertion_order/words`，无 `content` 全文。原 §三“没有任何一层能列出目录”的缺口确认**不成立**，特此更正。

### 3.2 真实缺口：`.spherse/` agent 世界书卡目录（留待世界书管理 UI）

四层硬隔离（by design）：`path-guard.ts:18-25`（点查拦截）、`card-store.ts:302`（walk 跳过）、`handlers/card.ts:9-11`（SDK 拒 `.spherse`）、server `SRV_READ` 无对应类别（`access-policy.ts:46-57`）。世界书卡只能走运行时隐式注入（`readAgentWorldbook` → projector），没有任何一面能列出“agent 挂了哪些卡”。

待世界书管理 UI 立项时再做，新 op 方案（按推荐排序）：

- **方案 A（推荐）**：新 `CardStore` 方法 `agentCards(slug)`，返回每文件 `{ name, target?, dangling?, entryCount, entries: id/comment/enabled/position 摘要 }`——复用 `listAgentCardLinks` ＋ `loadAgentCards` 按文件拆分。再沿现有链路逐层暴露：contracts schema → server 路由 → SDK action（`card.agentList`）→（可选）agent 工具。路径安全复用 `agentCardsDir`（`assertSafeSlug` ＋ root 内约束已具备）。
- **方案 B**：放宽 `CardStore.list` 加 `includeAgent` 参数。否决：`.spherse` 豁免是深思熟虑的隔离，开口子比新方法更容易误用。
- **方案 C**：`api.call` 加只读 card op。否决：与“card 走专用通道”规则冲突。
- 权限注意：server 路由的 project 访问策略与 `canRead` 钩子要确认放行；写操作本次不涉及（挂载仍走 `link_card/unlink_card`）。

## 四、决策点汇总（2026-10-21 已决，见同目录 `design.md`）

1. P2 的 N 存哪：entry 独立 `depth` 数字字段（`position: 2` 配合）；多位置块数量不做硬限制，少于三个只落文档与工具说明（projector 无 logger，不做运行时 warn）。
2. 缺省为数字 `3`（当前用户消息之前），旧字符串值读时一律归一；`0` / `1`（system 两序）仅作 opt-in。
3. 自定义字段首批只开 `extensions.*`（建议是）＋ `spherse_` 保留规则是否立。（2026-10-22 已决，见 §2.2：T1 浅合并＋`null` 删键、T2 只做 `case_sensitive`、T2'/T3 不做、`spherse_` 现在不定）
4. 新 op 做到哪一层为止（store＋server＋SDK 全套，还是先 store＋server）。（未立项，本次不做）
5. P3b 与 MCP 块的尾部相对顺序：拆为两个插入点由用户选择——`0`（MCP 之前，工具约束居末）/`1`（MCP 之后，默认，缓存友好且更靠近输入）；prompt cache 对比实测仍待真机验证（结论回写 tuning doc 待验项 #2/#4）。
