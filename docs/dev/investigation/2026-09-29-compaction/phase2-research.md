# 二期事项代码调研：手动压缩入口 / L3 / P0-6

时间：2026-09-30
性质：纯代码调研 + 方案有无判定，不含实施方案，不含代码改动。
一期（方案 A/L1/L2/B）见 `solutions.md` 与 `plan.md`。

## 1. 手动压缩入口——有方案，B 后需小修订

### 代码现状

- core 侧已有可复用入口：`preTurnCompaction` 在 `RuntimeDeps`
 （`session/runtime.ts:61`，`factory.ts` 按名注入，与 afterTurn 共用同一会话
  `observedWindow`，`capabilities/compaction/index.ts:12-18`）。
- 缺口有三：① `preTurnCompaction` 无 force 开关，强制只发生在 overflowed 内
 （`capabilities/compaction/transform.ts:58`）；② `SessionManager` 零压缩入口
  （全目录 grep 确认，无 `compact*` 方法）；③ `contracts` 只有 replay 的
  `compaction/applied`（`contracts/src/websocket.ts:135`），无 client `compact`
  消息；app 无按钮/命令。
- backlog P1-2（手动入口条）仍在。

### 方案情况

有。`solutions.md §6` + `README.md §6` 的三层分析仍然有效，B 之后 core 层细节
修订为：复用 `preTurnCompaction` + 加 force 旁路（阈值覆写）+ `SessionManager`
透传；server（WS 消息 + channel 透传 + 广播策略）与 app（按钮或 `/compact`
本地命令分支）层按原分析实施。可直接排期，无需新调研。

## 2. L3（压缩期收缩历史工具结果）——无方案，只有纲要

### 代码现状

- tail 清洗只有 `sanitizeToolCallPairs`（`context/compaction.ts:202-231`）：
  删无父 toolCall 的 `toolResult`，现保留 error 轮全文。
- `transform.ts build()`（62-75）只做 token 估计与 `excludedSeqs` 记录，不收缩。
- `fold.ts` 不收缩；机械摘要（`generateDigest`）本就丢 toolResult 正文——
  因此 L3 只影响 LLM 摘要输入体积与 tail 体积。
- 对照：opencode `prune()` 按 token 预算向前擦除旧工具输出。

### 方案情况

无。现有只有纲要（"最近 N 轮外 toolResult 正文换占位"），缺四个决策：
收缩位点（fold 内 / build 内 / 独立 projector）、占位格式、轮数与预算阈值、
与 `excludedSeqs`/digest 的交互。有利条件：L2 的 projector 模式可直接复用——
若收缩只做 wire 视图，零风险且工作量小（S 级）；若动落库/tail，需另议。

## 3. P0-6（检索大字段排除/降权）——原方案口径作废，需重写

### 代码现状（关键修正）

仓库里**没有检索索引**：`search_content` 是实时文件遍历
（`tools/search-content.ts` 的 `searchDir`/`searchInFile` + 子串匹配），
`search_card` 是内存逐条扫描（`capabilities/card/search.ts` 的 `searchEntries`，
默认只查 keys+comment，content 须显式指定，snippet 上限 2000，
`MAX_SEARCH_LIMIT = 100`）。因此 bugfix §8.9 “索引时跳过/降权”的前提不成立，
只能做**扫描时跳过**。

### 已有防护与残留缺口

- 已有：`search_content` 行 500 字/总量 32KB/100 条（P0-5）；
  `read_card` entry/many 32KB（L1）；L2 在 wire 层兜住所有工具结果。
- 残留：逐行扫描大文件的 CPU/内存成本，以及落库膨胀（wire  capped 但落库全文）。
  即 P0-6 剩下的价值已不是“防爆上下文”，而是扫描成本与落库体积。

### 方案情况

方向有（bugfix §8.9 P0-6 原文），但按“索引”口径写的不能直接用。
重写方向：文件名/字段名跳过表（如 `.card.json` 的 `replaceString` 类资产字段）
+ 大文件 fast-path。

## 汇总

| 事项 | 方案状态 | 动手前需要 |
|---|---|---|
| 手动入口 | 有，B 后小修订即可 | 直接排期 |
| L3 | 无，只有纲要 | 写 S 级方案（位点/格式/阈值三决策） |
| P0-6 | 原方案作废 | 按“扫描时”口径重写方案 |
