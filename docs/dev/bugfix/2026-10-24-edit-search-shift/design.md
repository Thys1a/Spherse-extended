# 编辑模式下搜索移位

- 日期：2026-10-24
- 状态：现状调研完成，待确认具体所指后定方案
- 排期：v1.0.3（bug）
- 范围：`EditFindReplaceBar`（`packages/app/src/features/content-browser/EditFindReplaceBar.tsx`）＋ `ContentView.tsx:197-216` 编辑态容器

## 现状（代码实情）

- 查找：`findMatches(text, query)`（`components/find-bar/find-engine.ts:31-45`）大小写不敏感子串，返回字符偏移；替换：`replaceOneAt`/`replaceAllOccurrences`（`content-browser/text-replace.ts:3-29`）。
- 跳转：`goTo` → `pendingSelection` → textarea `setSelectionRange` ＋ `scrollToOffset`（`EditFindReplaceBar.tsx:17-21,48-72`）。
- 替换后：`refocusIndex` 等文本更新重算 matches 后回到同下标（`:58-65,74-79`）。
- 搜索栏在编辑区上方以 in-flow 形式展开/收起（`ContentView.tsx:200-207`）。
- 测试：`EditFindReplaceBar.test.tsx`（替换逻辑）、`text-replace.test.ts`；滚动/选中无断言（jsdom 无布局）。

## 症状（已确认）

编辑模式下搜索某个词，跳转位置往往落在该词的上面或下面一段距离，而非词本身居中。即候选成因第 1 条成立，第 2/3 条降级为次要观察项（见下）。

## 成因（已锁定）

`scrollToOffset`（`EditFindReplaceBar.tsx:17-21`）按逻辑行数（`\n` 计数）× `lineHeight` 估算 `scrollTop`，两处系统性误差：

1. textarea 为 `leading-relaxed` ＋软换行（`ContentView.tsx:210`，无 `wrap="off"`），长行占多个视觉行，逻辑行数必然偏小 → 落点偏上；段间距/padding 未计入则偏下。表现为“上面或下面一段距离”。
2. `getComputedStyle(textarea).lineHeight` 取到 `normal` 时回退 20，与实际行高（base+relaxed）不符，全局性偏移。

次要项（本次不修，留档）：搜索栏 in-flow 展开顶布局（`ContentView.tsx:200-207`）；替换后 `refocusIndex` 回同下标可能指到另一个命中（`EditFindReplaceBar.tsx:58-65`）。

## 修复方向

`scrollToOffset` 不再手算行高：选中后 `textarea.focus({ preventScroll: true })`，再用浏览器原生定位把选中行居中（如临时 mirror div 测目标 offsetTop，或按 `selectionStart` 行居中）。替换 `EditFindReplaceBar.tsx:17-21` 一处，调用点（`:54`）不变。

## 测试

- jsdom：`setSelectionRange` 参数、focus preventScroll 调用（布局断言做不了）。
- 真机目检：长行换行文档中跳转落点居中；替换后选中仍在原词附近。

## 附带调研：编辑模式大纲快速跳转（现状）

- 阅读态大纲：`useContentToc` 从渲染 DOM 采 `[data-content-doc]` 内 `h1/h2/h3`（`useContentToc.ts:21-33`），`TocPanel` 点击 `scrollIntoView`（`TocPanel.tsx:15-18`）。
- 编辑态：`isEditing` 分支只渲染 textarea（`ContentView.tsx:197-216`），`scrollRef` 容器不存在 → entries 为空、面板不渲染。**编辑模式下顶栏/边栏均无大纲跳转**。
- 若要补：从 markdown 源码解析 `#` 标题行得字符偏移，点击走“选中＋居中”（与本 bug 同一滚动定位能力，可复用修复后的定位函数）；`tocOpen` 开关由父级透传（`ContentView.tsx:40,65`），面板复用 `TocPanel` 换数据源即可。
- 范围待定：只做边栏，还是顶栏下拉也要（需确认“顶栏/边栏”指哪个入口）。
