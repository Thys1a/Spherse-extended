# 编辑模式下搜索移位——附带调研

- 日期：2026-10-24
- 说明：本文件存放与本次 bug 同源但不在本次修复范围内的调研结论；修复方案见同目录 `design.md`。

## 1. 编辑模式大纲快速跳转（现状）

- 阅读态大纲：`useContentToc` 从渲染 DOM 采 `[data-content-doc]` 内 `h1/h2/h3`（`useContentToc.ts:21-33`），`TocPanel` 点击 `scrollIntoView`（`TocPanel.tsx:15-18`）。
- 编辑态：`isEditing` 分支只渲染 textarea（`ContentView.tsx:197-216`），`scrollRef` 容器不存在 → entries 为空、面板不渲染。**编辑模式下顶栏/边栏均无大纲跳转**。
- 若要补：从 markdown 源码解析 `#` 标题行得字符偏移，点击走“选中＋居中”（与本 bug 同一滚动定位能力，可复用修复后的定位函数）；`tocOpen` 开关由父级透传（`ContentView.tsx:40,65`），面板复用 `TocPanel` 换数据源即可。
- 决策：**只做边栏**（顶栏下拉不做）。

## 2. 替换后重定位次要项（本次不修，留档）

- 替换后 `refocusIndex` 等文本更新重算 matches 后回到同下标（`EditFindReplaceBar.tsx:58-65,74-79`）；
- `handleReplaceOne` 固定 `setRefocusIndex(safeIndex)`，新 `matches` 数组已变，`matches[safeIndex]` 是按新文本顺序的第 N 个，不保证是原逻辑项的后继；
- 最小实例：`text="foo bar foo", query="foo"` → `matches=[{0,3},{8,11}]`；`safeIndex=0` 替换为 `"baz"` → 新文本 `"baz bar foo"`，新 `matches=[{8,11}]`，`min(0,0)=0` 选中原 index=1 的项。长度变化/替换串含 query 时错位更大；
- `replaceAll`（`:81-90`）替换后无任何 `refocus/goTo`，`matchIndex` 残留旧值靠 `safeIndex = min(matchIndex, len-1)`（`:36`）钳位。
