# 编辑态搜索 CRLF 选区错位：方案

- 日期：2026-10-28
- 状态：待评审（实现中）
- 版本：v1.0.3
- 来源：同目录 `research.md`（方案 B：写入点转换）

## 一、结论摘要

搜索与替换继续用原始文本坐标；只在写入 textarea 选区与滚动位置前，把偏移转换为 textarea 坐标。两个生产调用点：`goTo` 与替换后 `refocusIndex` 的 `pendingSelection` 构造处。

## 二、现状（file:line 实证）

- 匹配：`EditFindReplaceBar.tsx:33`（`findMatches(text, query)`，`text` 为原始 `editedContent`）；
- 写入：`:48-56` 跳转 effect，`setSelectionRange(pendingSelection.start, pendingSelection.end)` + `scheduleCenter(textarea, pendingSelection.start, frameRef)`；
- 生产者：`goTo:67-72`（`setPendingSelection({start: matches[idx].start, end: matches[idx].end})`）、替换后 `:58-65`（`setPendingSelection({start: matches[idx].start, end: matches[idx].end})`）；
- 读取：`handleReplaceOne:74-79` 用 `matches[safeIndex]` 做 `replaceOneAt`（原始坐标，必须不动）。

## 三、方案

### 1. 新增 `toTextareaOffset`（`textarea-reveal.ts`，与居中能力同模块）

```ts
export function toTextareaOffset(text: string, offset: number): number;
```

语义：返回 `offset` 在 textarea 归一化坐标系下的位置 = `clamp(offset) - 该偏移前的 \r\n 对数`（只统计 pair 起始 `< offset` 的；孤立 `\r` 长度不变，不计数）。

### 2. 两处调用点转换（`EditFindReplaceBar.tsx`）

- `goTo`：`setPendingSelection({ start: toTextareaOffset(text, m.start), end: toTextareaOffset(text, m.end) })`；
- 替换后 `refocusIndex` effect：同样转换后再 `setPendingSelection`；
- 跳转 effect（`setSelectionRange` + `scheduleCenter`）不动——`pendingSelection` 已是 textarea 坐标；
- `handleReplaceOne`/`replaceAllOccurrences` 不动（原始坐标）；
- `start`/`end` 各自独立转换（match 可能横跨换行）。

非目标：不改 `findMatches`、不改替换写回、不改阅读态、不改 `textarea-reveal` 测量逻辑（输入已是归一化偏移，与 `textarea.value` 同坐标系）。

## 四、测试

- `toTextareaOffset` 纯函数用例：无 CRLF 时恒等；CRLF 文档中间/首/尾偏移；恰落在 `\r` 与 `\n` 之间的偏移；孤立 `\r` 不计数；越界钳制；
- `EditFindReplaceBar.test.tsx`：CRLF 文本搜中部词，跳转后选区等于归一化坐标的词范围；替换后 refocus 回到同一词的归一化选区；
- 命令：`npm test --workspace=packages/app -- src/features/content-browser/EditFindReplaceBar.test.tsx`；
- 现有 `\n` 用例全量回归（转换在该场景下是恒等函数）。

## 五、验收与改动清单

改动文件：`textarea-reveal.ts`（新增导出）、`EditFindReplaceBar.tsx`（两处构造点）、`EditFindReplaceBar.test.tsx`。

验收：CRLF 文档上/中/下三处跳转选区正确、替换后选中仍正确；`\n` 文档行为零变化；lint、typecheck 通过。
