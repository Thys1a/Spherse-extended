# plan：编辑模式大纲快速跳转

- 对应设计：同目录 `design.md`（待评审，评审通过后实施）
- 依赖：`textarea-reveal.ts`（`measureMatchCenter`/`scheduleCenter`/`cancelCenter`）已由 edit-search-shift 先合提供；若未合，本 plan 第 0 步先建模块（实现与 bugfix design §2 同文）

## 任务（按序，前者是后者的前置）

### 0.（条件）新建 `textarea-reveal.ts`

仅当 edit-search-shift 未合时执行，实现与其 design §2 完全一致。

- verify：`npm run lint --workspace=packages/app`、`npm run typecheck --workspace=packages/app` 通过。

### 1. 新建 `packages/app/src/features/content-browser/markdown-toc.ts`＋单测

实现 design §三.1：`EditTocEntry`、`parseMarkdownToc`（frontmatter 跳过、围栏字符＋长度跟踪、ATX 0–3 空格/闭合序列/空标题跳过、setext、顶层标题、已知差异）。

- verify：`npm test --workspace=packages/app -- src/features/content-browser/markdown-toc.test.ts`（含 design §五全部用例：长围栏包短围栏、HTML 注释、`# foo#`、`# ###`、CRLF）。

### 2. `frontmatter.ts` 收敛＋单测

新增 `splitFrontmatter` 并让 `parseFrontmatter` 调用它（`body` 语义不变）；追加 `splitFrontmatter` 用例（有/无/损坏 frontmatter），旧用例全量保留。

- verify：`npm test --workspace=packages/app -- src/features/content-browser/frontmatter.test.ts`。

### 3. `TocPanel.tsx`＋单测

`onJump?`、`containerRef?`（至少传一个；`handleSelect` 先看 `onJump`）；旧调用与旧用例零改动。

- verify：`npm test --workspace=packages/app -- src/features/content-browser/TocPanel.test.tsx`（新增 onJump 用例＋scrollIntoView 隔离，旧用例回归）。

### 4. `ContentView.tsx`＋`Header.tsx`＋单测

`readTocVisible`/`editTocVisible` 拆分（阅读面板改用 `readTocVisible`）；编辑分支 row 包裹＋textarea 加 `min-w-0`；`editTocEntries`（`isEditing && tocOpen && isMarkdown`＋同一 `editedContent` 快照）；`handleEditTocJump`（选整行→`focus({preventScroll:true})`→`scheduleCenter`；`frameRef`＋卸载取消）；`Header.tsx:99` 去 `!isEditing`（`Header.test.tsx` 无需改）。

- verify：`npm test --workspace=packages/app -- src/features/content-browser/ContentView.test.tsx`（编辑态边栏渲染＋点击选区；阅读态不受影响）。

### 5. 人工验证＋收尾门

按 design §五走完长 md 逐项点击、窗口缩放、横向溢出确认。

- verify：`npm run lint --workspace=packages/app`、`npm run typecheck --workspace=packages/app`、相关单测全绿；验收：design §七逐项通过。
