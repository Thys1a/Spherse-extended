# 编辑态搜索 CRLF 选区错位——调研

- 日期：2026-10-28
- 状态：根因已锁定，待实施
- 排期：v1.0.3（bug）
- 范围：`EditFindReplaceBar` 跳转选区（`packages/app/src/features/content-browser/EditFindReplaceBar.tsx`）

## 一、症状

编辑模式下打开 CRLF 换行文件，输入确实存在的关键词并按“下一个”跳转，选区落在目标词右侧：关键词越往文档中间，偏得越多。`\n` 文件一切正常。

## 二、复现证据（临时诊断用例，已删除）

文本 `"line1\r\nfoo bar\r\nline3 foo"`，搜 `foo`，点“下一个”：

- 期望选中第二个 `foo`（浏览器归一化坐标 20–23）；
- 实际选中 22–23（原始文本坐标），只框住半个词。

实测 `selectionStart` 为 22 而非 20，恰好等于该匹配点之前的 `\r` 数量（2 个）。

## 三、根因（已核对代码）

1. `EditFindReplaceBar.tsx:33` 用 `findMatches(text, query)` 计算匹配，`text` 是 `editedContent` prop（文件原始内容，`\r\n` 原样保留）。
2. `:52-54` 的跳转 effect 把算出的 `{start, end}` 直接传给 `textarea.setSelectionRange`。
3. 但浏览器/jsdom 会把 textarea 的值归一化为 `\n`（WHATWG "normalize newlines"：`\r\n` → `\n`，孤立 `\r` → `\n`）。React 受控 textarea 的 DOM 值同样是归一化的。
4. 于是每个位于匹配点之前的 `\r\n` 让选区右偏 1 个字符；偏置随文档深度线性增长。

同一病根还影响 `textarea-reveal.ts` 的 mirror 测量（`value.slice(0, offset)` 用原始偏移切归一化后的串），只是多被钳制/回退掩盖。

不受影响：`handleReplaceOne` 的替换写回（`replaceOneAt` 全程用原始坐标，自洽）；阅读态（`collectText` 从已归一的 DOM 采集，收发同坐标系）；大纲跳转（`parseMarkdownToc` 入口已归一化，见 `2026-10-27-edit-toc`）。

## 四、修复方向权衡（2026-10-28 已决策）

- 方案 A（入口归一化）：`text` 进组件即归一，搜索/替换/选区全用归一化坐标。改动小，但首次替换写回会把全文件 CRLF 洗成 LF，且跨行查询语义随之改变。
- 方案 B（写入点转换，采纳）：搜索与替换继续用原始坐标；只在写入 textarea 选区与滚动位置前，把偏移转换为 textarea 坐标（减去该偏移前的 `\r\n` 对数）。改动面最小，不改变匹配语义与替换行为，不要求替换时映射回原文。

已知残留：孤立 `\r`（非 `\r\n`）按 0 换算——WHATWG 下它归一为 `\n` 但长度不变（1→1），计数 `\r\n` 对即精确，无需处理；真正的史前 Mac 换行文件可忽略。
