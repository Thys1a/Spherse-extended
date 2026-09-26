# `search_content` 单条工具结果可撑爆上下文（整行原文返回、无长度上限）

- 日期：2026-09-22
- 影响文件：`packages/core/src/tools/search-content.ts`（主）、`packages/core/src/utils/binary-detect.ts`（次）、`packages/core/src/tools/read-file.ts`（配套）

## 现象


任务只有一句话：`将全局快速命令补充到首页+注册为command`。事件流（`assistant-acb0db/sessions.db`，14 条事件、0 条 message）全貌：

| 时间 | seq | 动作 | in | cacheRead | total | out | 结果 |
|---|---|---|---|---|---|---|---|
| 13:23:09 | 0–2 | 玩家消息 → `list_files` + `read_file(全局快速命令.md)` | 22,839 | 0 | 22,962 | 123 | 正常 |
| 13:23:14 | 5 | `read_file(index.data.json)` + `read_file(index.html)` | 3,391 | 22,784 | 26,270 | 95 | 正常 |
| 13:23:24 | 8 | `read_file(AGENTS.md)` + `search_content("command")` + `list_files(pages)` | — | — | — | 1,776 | 正常 |
| 13:23:24 | **12** | **工具结果回灌后再次调用** | **206,096** | 45,696 | **251,793** | **1** | **空回** |
| 13:23:37 | 13 | `turn/end reason:"completed"` | | | | | **静默** |

seq 12 的 `content` 只有一个思考块 `{"thinking":"That"}`（3 个字符），`stopReason:"length"`、`output=1`。渲染出来就是空气泡。

**关键点：一轮从 3.4k 冲到 206k。** 罪魁是 seq 10 的 `search_content` 工具结果——它命中了 `IdolProject/IdolProject.card.json:1218`，**单条正文 716,744 字符**（≈717 KB）。成品工具结果合计约 1.06 MB。

## 根因

`search_content` 是"逐行读文件 → 子串匹配 → **整行原文**写进结果"，并且**只有命中条数上限（100），没有单条长度上限、没有总字节上限**：

`packages/core/src/tools/search-content.ts:67-79`
```ts
const content = buf.toString("utf-8");
const lines = content.split("\n");
const lowerQuery = query.toLowerCase();
for (let i = 0; i < lines.length && results.length < maxResults; i++) {
  if (lines[i].toLowerCase().includes(lowerQuery)) {
    results.push({ file: filePath, line: i + 1, text: lines[i].trimEnd() });  // ← 整行，无上限
  }
}
```

```ts
const MAX_RESULTS = 100;   // 只限制条数
...
const text = results.length > 0
  ? results.map((r) => `${r.file}:${r.line}: ${r.text}`).join("\n")   // ← 拼接时同样无上限
  : `No matches found for "${params.query}"`;
```

三层叠加：

1. **压缩成单行的 JSON，一"行"等于整个文件。** `IdolProject.card.json` 是 270 KB 压缩 JSON；它的 `replaceString` 字段（卡里内嵌的整张报名表 HTML）把 716 KB 正文全压在一行里。命中即整行吐出。
2. **短查询词命中大字段的概率极高。** `query:"command"` 在卡 JSON 里到处出现（`replaceString` / `first_mes` / `description` / `command_style` 都算），必然命中最大的那个字段。
3. **既没被二进制检测拦下，也没被收窄。** `isBinaryBuffer` 只看前 8192 字节有没有 `0x00`（`utils/binary-detect.ts`），文本 JSON 直接放行；这次调用也没给 `includePatterns` / `path`，默认扫**整个项目根**、**所有文件类型**。

**这不是"会话太长"，而是"某一次工具返回太大"。** 与既有草案 `2026-09-21-empty-turn-on-context-overflow` 的区别：那份记录的是"多轮累积 / 压缩后仍不够"，本条是**单条工具结果一次顶穿**，与对话长度、任务大小无关。

## 上游为什么会这么用

不是 agent 乱来，是三条共同结果：

1. **任务是全项目机制排查**——"注册为 command"要不要做、怎么做，属于"Spherse 有没有这个机制"的通查，`search_card`（只搜世界书条目）、`read_file`（要已知路径）都干不了，只有 `search_content` 能做。
2. **项目规则只禁"世界书卡"，没禁"原始卡 JSON"**。`全局快速命令.md` 原文是"不要用 `search_content` 去扫卡文件：一条世界书正文常有几千字且不换行……"，而当时根目录恰好躺着 `IdolProject.card.json`（原始卡，不是世界书），规则没覆盖。
3. **没有相关 skill 引导**。`packages/presets/skills/` 下 8 个内置 skill 没有一个讲 command（详见"关联问题"）。

## 修复方案（草案）

### P0-1 单条结果长度上限 + 截断标注（主修）

`searchInFile` 里对每行做长度截断，超出即裁切并标注实际长度：

```ts
const MAX_LINE_CHARS = 500;   // 可配
const raw = lines[i].trimEnd();
const text = raw.length > MAX_LINE_CHARS
  ? raw.slice(0, MAX_LINE_CHARS) + ` …(该行共 ${raw.length} 字符，已截断)`
  : raw;
results.push({ file: filePath, line: i + 1, text, truncated: raw.length > MAX_LINE_CHARS });
```

并在返回的 `details` 里带上 `truncatedLines`（条数）与 `maxLineLength`（本文件最长命中行），让上层能判断"这次搜索是不是撞上了巨型行"。

理由：一条 717 KB 的命中，即使模型窗口 1M 也是纯噪声；截断是最低成本、最直接的止损。

### P0-2 总输出字节上限（第二道闸）

`MAX_RESULTS=100` 之外再加一个总量闸（建议 64 KB）：累积到上限即停止扫描，并在结果尾部追加 `…（已达输出上限 64 KB，结果被截断，请缩小关键词或指定 path）`，`details.truncated = true`。当前 `details.truncated` 只反映"命中数达到 100"，撞上单条巨行时永远是 `false`，是失真信号。

### P0-3 跳过大字段值 / 二进制旁路

- **索引层**：对 `.card.json` 这类已知的大字段结构，匹配时跳过明显是资产的值（`replaceString`、`first_mes`、`mes_example`、含 `data:` / base64 长串的值）。它们靠 `read_file` + 路径打开比全文检索合适得多。
- **二进制旁路加固**：`isBinaryBuffer` 只采样前 8 KB 且只查 `0x00`，对"文本但超长单行"完全无感；建议补一条"单行超长即跳过/截断"的兜底（P0-1 已覆盖路径，但检测层单独加会更稳）。

### P1-1（配套）`read_file` 的渐进式读取

本次 seq 6 里 `read_file(index.html)`（40 KB）也是整份进上下文。建议大文件首次只回前 N KB + 结构摘要，由 agent 显式 `offset` / `limit` 续读；至少给 `details` 回 `totalLength` + `returnedLength`，让模型知道"还有多少没看到"。

### P1-2（配套）文档侧后续动作

本次已在项目侧补了规则（`全局快速命令.md`）：`*.card.json` 一律用 `search_card` / `read_card`；全项目检索必须带 `includePatterns` + `path`，禁止裸搜短词。**本节不在本草案改动范围内**，仅记录关联。

## 测试

- `__tests__/tools/search-content.test.ts` 新增：
  - 单行 1 MB 的 JSON，`query` 命中该行 → 结果不含全量正文，含截断标注与 `details.maxLineLength`
  - 构造 100 条 x 1 KB 命中 → 在 64 KB 处停止，`details.truncated === true`
  - 常规小文件命中 → 行为与现有测试一致（不回归）
- 手工回归：在 `spherse框架` 项目根裸搜 `command`，确认返回体不再超过上限，且仍能提示命中文件位置。

## 影响面与取舍

- **取舍：宁可信息略少，也不要一次爆窗。** 截断会让 agent 看不到完整行，但它本来也不该靠 `search_content` 读大字段；正确路径是拿到 `file:line` 后用 `read_file` 按需取。
- **不改 `MAX_RESULTS=100`**：条数上限本身合理，问题只在"每条长度"与"总量"没有闸。
- **与 `2026-09-21-empty-turn-on-context-overflow` 的关系**：那份负责"发生时不静默 + 能自愈"（P0-1 不记 `completed`、P0-3 溢出即压缩）；本草案负责"别让一次工具返回就把窗口打爆"，**两者互补，都要做**。

## 关联问题（不在本草案范围，建议单独立项）

"注册为 command" 这件事**没有 skill 引导**：

| 层 | 位置 |
|---|---|
| 存储 | `.spherse/commands/*.md`（`packages/core/src/store/project.ts:75`） |
| 格式 | frontmatter（`name` / `description?` / `model?`）+ `template` 正文，`gray-matter` 解析（`store/command.ts`） |
| 契约 | `packages/contracts/src/commands.ts` |
| API | `GET/POST/PATCH/DELETE /api/projects/:projectId/commands[/:name]`（`server/src/routes/commands.ts`） |
| 调用 | `core/src/session/slash.ts` + 前端 `slash-menu.ts` / `CommandCard.tsx` / `features/command-panel/` |

`packages/presets/skills/` 下 8 个内置 skill 无一涉及 command。建议：① 新增 `spherse-create-command`（或并入 `spherse-guide`）；② 在 `spherse-guide` 补一张"我要做 X → 用什么"的路由表，把 `search_content` 从"第一反应"降为"最后手段"。这能同时消掉本条 bug 的**上游诱因**。

## 代码调研补充（2026-09-26，对照仓库现状）

- 主引证逐行命中：`searchInFile` 50-80、`MAX_RESULTS = 100` 在 127 行、`details.truncated` 在 173 行（`results.length >= MAX_RESULTS`）。确认三点：① 71-79 循环只做子串匹配 + `trimEnd()`，无单条长度上限；② 167-169 拼接同样无总量上限；③ 撞上单条巨行时 `matches < 100` ⇒ `truncated === false`，确为失真信号。P0-1 / P0-2 均为新增闸门、无现状冲突。
- `binary-detect.ts` 全文件 5 行：`BINARY_SAMPLE_SIZE = 8192` + `subarray(0, 8192).includes(0x00)`，提案引用精确；"文本但超长单行直接放行"的结论成立。
- 默认扫全项目根属实：135 行 `params.path ? resolveProjectPath(...) : root`，`path` 缺省即全根扫描；`includePatterns` 缺省即全类型（`matchesPattern` 23-29 空 pattern 返回 true）；`.spherse` 默认排除（`shouldSkipInSearch` 39-42 + 139-144 的 `include_meta` 守卫）。裸搜短词打爆的路径成立。
- `read-file.ts`（全 78 行）：参数仅 `{ path }`（22-24），**无 `offset` / `limit`**；71 行整文件 `buf.toString("utf-8")` 后全量返回，`details` 仅 `{ path, size }`（74 行）或二进制分支的 `{ binary, image, size }`（67 行），无 `totalLength` / `returnedLength`。P1-1 渐进式读取与"让模型知道还有多少没看到"均为新增 API，现状确认。
- 测试现状：`__tests__/tools/search-content.test.ts` 现有 7 用例（跨文件命中、大小写不敏感、子目录、`includePatterns`、跳过 dotfiles/node_modules、无命中、100 条截断），**无超长单行、无总量上限用例**，提案的三条新增测试无重叠、可直接追加。
- 关联表复核：`presets/skills/` 下恰好 8 个 skill（`spherse-write-html` / `spherse-build-data-app` / `spherse-guide` / `spherse-use-ui-sdk` / `spherse-create-ui-theme` / `spherse-create-skill` / `spherse-create-agent-chat-theme` / `spherse-embed-chat`），"无一涉及 command"属实；command 存储链 `store/command.ts`（`commandsDir/*.md` + `gray-matter` + frontmatter `description/model` + `template`，128-131 行）确认，`store/project.ts:75` 的行号引用已漂移（现 `project.ts` 的 matter 相关在 198-199 行），实现 P1-2 前建议重对该引用。

## 修复方案（2026-09-26 定稿；不做 skill、不做 `offset/limit` API、不做 `.card.json` 字段级跳过）

截断常量（`MAX_LINE_CHARS` / `MAX_OUTPUT_CHARS` / `READ_FILE_LIMIT`）放一处共享（`packages/core/src/tools/output-limits.ts`），`search_content` 与 `read_file` 共用，避免两处漂移。

改 `search-content.ts`：

- `MAX_LINE_CHARS = 500`：超长 `slice` + `…(该行共 N 字符，已截断)`；
- `MAX_OUTPUT_CHARS = 32 * 1024`（取 32KB 而非 64KB：500/行 × 100 条 ≈ 52KB，64KB 闸永不触发）：累积超限停扫，文末提示缩小关键词 / 指定 `path`；
- `details`：`truncated` = 命中数 ≥ 100 **或**触总量闸**或**有截断行；加 `truncatedLines`、`maxLineLength`。

改 `read-file.ts`：正文不截断（>32KB 合法源文件无续读路径，截断即引入新"读一半"；`offset/limit` 另立需求）；仅补 `details: { path, size, totalLength, returnedLength }`，本轮 `returnedLength === totalLength`。`list_files` 只回路径，评估后不改。

测试（`search-content.test.ts` 追加）：单行 1MB JSON 命中 → 无全文、有截断标注、`maxLineLength`；100 × 1KB → 在 32KB 处停、`truncated === true`、总长 ≤ 32KB；小文件回归。`read-file` 加 details 用例。

验证：`npm test --workspace=packages/core`。
