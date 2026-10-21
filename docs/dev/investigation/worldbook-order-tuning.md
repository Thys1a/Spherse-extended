# Worldbook 顺序与预算调优记录（R7.2 / R7.3）

- 日期：2026-09-18（与 T14/T15 同批落盘）
- 范围：`packages/core/src/capabilities/card/worldbook.ts`（`matchWorldbook` / `worldbookProjector`；`applyWorldbookBudget` 已于 v1.0.3 删除）
- 状态：v1.0.3 起取消注入预算上限（全量注入，安全阀改为链接旁 token 画像）；**真机 prompt 实测尚未执行**，下轮留空位。

## 已落定的约定

- 注入位置：worldbook 块以独立 `user` 消息追加于消息尾（fold 后 messages 之末），效果顺序在 skill-catalog（含 `<memory>` / `<time>` 等 contextBlocks 产物）之后；`position` 首版忽略（before_char/after_char 不做映射）。
- 自反馈阻断：上轮注入的 `<worldbook>` 块不计入下轮扫描文本（`recentTextOf` 剥离），否则命中条目永久续注。
- 匹配语义：`constant` 恒注入；`enabled: false` 跳过；`selective: true` 取 ST AND 语义（primary 与 secondary 必须同时命中，primary-only 与 secondary-only 均不触发；任一为空恒不触发）；大小写/正则复用 `search.ts` 的 `matchKeys`（正则编译附 500 条上限缓存）。
- 卡面范围：仅 agent 目录顶层 `*.card.json`（不递归子目录）；agent 卡不进 `CardStore` 工具面（`walkCardFiles` 跳过 `.spherse`），`search_card`/`edit_card` 不可见——worldbook 卡走文件管理。
- 排序：按 `insertion_order` 升序（数值越小越优先，与 ST 语义一致；非有限值按 0）。
- 截断：v1.0.3 起取消每轮注入预算上限（`applyWorldbookBudget` 已删除），命中条目按 `insertion_order` 全量注入；安全阀改为 Agent 编辑框世界书链接旁的 token 画像（常驻 / ≤最坏双值 + 最坏占比），由用户自行拆分卡片。
- Token 口径：`estimateTokens`（`context/token-estimate.ts`，与 `getStatus` 同一估算器），`renderWorldbook` 渲染后文本整体计量。
- 扫描面：最近 10 条消息 / 4000 字符内的文本块与 toolCall 名（含参数 JSON）；图片/thinking 等非文本块不参与（有意的：纯图片轮次不触发）。
- 缓存：目录 mtime + 各卡文件 (mtime, size) 指纹，逐轮复核；改卡即时生效，无需外部失效（`invalidateWorldbookCache` 仅留作显式入口）。

## 待真机验证项（prompt 实测一轮时填）

1. token 占比：worldbook 块占整窗比例（目标：常规对局 < 15%）。
2. 指令遵循率：命中条目内容被 Agent 采纳的比例；constant 条目是否造成注意力稀释。
3. 预算调参：v1.0.3 已取消上限，不再收紧条目数/token；若占比超标，由用户按链接旁 token 画像自行拆分卡片（常驻高者优先拆）。
4. 位置语义：若实测证明队尾 user 块被模型忽视，再评估 before/after_char 映射（改动面：`worldbookProjector` 插入点 + 本记录更新）。

## 判定标准

- token 占比 / 指令遵循率双指标；调优结论回写本文件后再合入对应改动。
