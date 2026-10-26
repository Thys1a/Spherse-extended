# 编辑模式大纲快速跳转：方案

- 日期：2026-10-27
- 状态：待评审
- 版本：v1.0.3
- 来源：`docs/dev/bugfix/2026-10-24-edit-search-shift/research.md` §1（“只做边栏”决策）+ 本次代码现状核查（只读，未改代码）

## 一、结论摘要

1. 编辑态目前无任何大纲入口：`isEditing` 分支只渲染 textarea（`ContentView.tsx:197-216`），顶栏大纲按钮被 `!isEditing` 门控（`Header.tsx:99`）屏蔽。
2. 路径：markdown 源码解析标题得字符偏移，点击走“选中整标题行＋居中”（复用 `edit-search-shift` 的居中能力契约）；边栏复用 `TocPanel`（加可选 `onJump`）；`Header` 去掉编辑态门控；无新增 i18n key、无 contracts/server 改动。
3. 预防性收敛一个隐蔽残留：`tocVisible`（`ContentView.tsx:128`）不含 `!isEditing` 门控，进编辑态后 `enabled`/`docKey` 均不变 → `useContentToc` effect 不重跑，`entries` 残留阅读态旧值（此时 `scrollRef.current` 已为 null；编辑分支不渲染面板故当前无可见症状，但退出编辑后若 `docKey` 未变、保存后的新标题不会刷新）。拆分 `readTocVisible = tocVisible && !isEditing` 让 `enabled` 翻转重跑清空（见 §三.3）。

## 二、现状（file:line 实证）

- 阅读态大纲：`useContentToc` 从 `[data-content-doc]` 采 `h1[id]/h2[id]/h3[id]`（`useContentToc.ts:26-33`），`TocPanel` 点击 `scrollIntoView({ behavior: "smooth", block: "start" })`（`TocPanel.tsx:15-18`）；`tocVisible` 与 entries 计算在 `ContentView.tsx:128-129`，面板挂载在 `:244`。
- 开关透传已就绪：`tocOpen` state 在 `index.tsx:43`，透传两支 `ContentView`（`:165,191`），`tocAvailable={isMarkdown}`（`:113`）；唯一缺口是 `Header.tsx:99` 的 `!isEditing`。
- 编辑态文本含 frontmatter：`enterEdit` 全文拷贝 `content`（`useContentEditor.ts:59-62`），解析器必须跳过 frontmatter 块且偏移量保持全文坐标系（textarea.value 坐标系）。
- 测试基线：`TocPanel.test.tsx:46-65` 已钉住旧点击路径（可直接作回归用例）。

## 三、方案

### 1. 标题解析器（新增纯函数）

新增 `packages/app/src/features/content-browser/markdown-toc.ts`：

```ts
export interface EditTocEntry { text: string; level: number; offset: number }
export function parseMarkdownToc(text: string): EditTocEntry[]
```

- `offset` = 标题行首在全文中的字符偏移（与 `textarea.value` 同一坐标系）；
- frontmatter 跳过：`frontmatter.ts` 新增导出 `splitFrontmatter(raw: string): { blockLength: number; frontmatter: Record<string, unknown> | null }`，内部做唯一一次判定（正则命中后对 `match[1]` 做 `yaml.load`＋对象检查；失败时 `blockLength = 0`，保证与阅读态渲染的 body 一致——YAML 损坏时两侧都把块内 `#` 行当正文处理）；`parseFrontmatter` 改为调用它（`body` 仍走现有前导换行剥离）；`markdown-toc` 从 `blockLength` 起按行扫描；
- 行扫描记录行首偏移，行尾 `\r` 先剥离再匹配（CRLF 安全）；
- 围栏跟踪：`` ``` `` / `~~~` 开启行要求 ≤3 空格缩进，记录围栏字符（`` ` ``/`~`）与长度；仅当某行同字符、长度 ≥ 开启长度、且行内无其他内容时才关闭，`` ``` `` 与 `~~~` 不互相关闭；围栏内整行跳过（用例补「长围栏包短围栏」）；
- ATX：`^ {0,3}#{1,6}(?:\s|$)`，`level` 取 `#` 个数，`level > 3` 忽略（与阅读态只收 h1–h3 对齐）；`text` 去尾部闭合序列（`/ +#+ *$/`）后 trim，空标题跳过；
- Setext：第 i 行为全行 `=+` / `-+`（strip 后判定）且上一行非空 → 上一行为标题（`=` level 1，`-` level 2），`offset` = 上一行行首；围栏内与 frontmatter 内不触发（CommonMark 下 `foo\n---` 本就是 setext h2，`---` 单独成段不成标题，无误判）；
- 只收顶层文档流标题：`>` 引用前缀行（`^ {0,3}>`）整行跳过，列表标记行天然不匹配 ATX 正则；与阅读态（DOM 全量子查询，引用/列表内标题也收）存在已知差异，见 §四；
- 4 空格以上缩进的 `#` 视为代码块，不收（CommonMark ATX 最多 3 空格缩进）。

### 2. `TocPanel` 加可选跳转回调

`TocPanel.tsx:6-18` 改为：

```ts
onJump?: (index: number) => void;
containerRef?: RefObject<HTMLDivElement | null>;
```

- `onJump` 与 `containerRef` 至少传一个：`handleSelect` 先看 `onJump`（调 `onJump(idx)`），否则走 `containerRef.querySelector`/`scrollIntoView` 全路径；不传 `onJump` 时旧调用与旧用例零改动即回归；
- 编辑态调用侧把 `EditTocEntry` 映射为 `TocEntry`（`id: \`edit-${idx}\``，`text`/`level` 直传）＋ 只传 `onJump`，不再传恒为 null 的 `scrollRef`，`TocEntry` 类型不动。

### 3. `ContentView` 编辑分支接线

- 拆分可见性：`readTocVisible = tocVisible && !isEditing`（修复机理见 §一.3：`enabled` 翻转触发 effect 重跑并清空）；`editTocVisible = tocOpen && isEditing && isMarkdown && !loading && !error && !binary`；阅读分支面板渲染改用 `readTocVisible`（`:244` 现用 `tocVisible`，两者在 `!isEditing` 下等价，统一名字避免并存）；
- `editTocEntries = useMemo(() => { if (!(isEditing && tocOpen)) return []; return parseMarkdownToc(deferredEdited); }, [isEditing, tocOpen, deferredEdited])`，其中 `deferredEdited = useDeferredValue(editedContent)`（面板打开时避免每次击键 O(n) 全文扫描掉帧；阅读态 `useContentToc` 同款门控思路）；
- 编辑分支布局：`{editFindOpen && ...}` 保持第一行；textarea 与面板包一层 `div.flex min-h-0 flex-1 flex-row`，textarea 追加 `min-w-0`（`flex-1` 保留），面板复用 `TocPanel` 现有 `w-56` 样式；
- `handleEditTocJump(index)`：取 `entry.offset`，行尾 = 下一个 `\n`（无则文末；CRLF 下排除末尾 `\r`）→ `textarea.setSelectionRange(offset, lineEnd)` → `textarea.focus({ preventScroll: true })` → 下一帧调共享居中 `scheduleCenter(textarea, offset, frameRef)`（顺序与 bugfix §1 一致；`frameRef: useRef<number | null>` 归 `ContentView` 所有＋仅卸载 effect 调 `cancelCenter(frameRef)`，禁止在跳转 effect cleanup 里取消——机理同 bugfix C1）；
- 居中能力契约见 `docs/dev/bugfix/2026-10-24-edit-search-shift/design.md` §2，`textarea-reveal.ts` 导出面钉死为：`measureMatchCenter(textarea, offset): number | null`、`scheduleCenter(textarea, offset, frameRef): void`、`cancelCenter(frameRef): void`；三者不负责 `setSelectionRange`/`focus`，由调用方按上式顺序执行；两个消费者收敛到同一共享模块，先合者建模块，后者直接 import；

### 4. `Header` 去门控

`Header.tsx:99` `{tocAvailable && !isEditing && (` → `{tocAvailable && (`。按钮仅按 `isMarkdown` 显示（`index.tsx:113`）；loading/error/binary 下按钮可见但面板不渲染（与阅读态一致）。`index.tsx` 开关透传不动。

## 四、已决策

- 只做边栏（沿用 research 决策），顶栏下拉不做；
- 标题级别只收 1–3，与阅读态 `h1/h2/h3` 对齐；4 级以下忽略；
- Setext 1/2 级支持（与阅读态渲染结果一致；仅支持单行段落，多行段落只取上一行）；
- 点击行为：选中整标题行＋居中，不止移光标；
- 无滚动跟随高亮当前节、无快捷键（Ctrl+F 是查找的，TOC 沿用顶栏按钮）；
- 已知差异（非 bug，用例钉住）：只收顶层文档流标题，引用块/列表内标题不收；setext 仅支持单行段落（多行段落只取上一行）；标题文本保留源码行内 markup（与阅读态渲染后纯文本不同）；
- 无新增 i18n key（复用 `content-browser.toc.title`）。

## 五、测试

- 单测 `markdown-toc.test.ts`（纯函数）：ATX 1–3 收 / 4+ 级忽略、闭合序列去尾（`# foo #` 去尾、`# foo#` 保留尾部 `#`、`# ###` 变空跳过）、setext 1/2、围栏内 `#` 排除、长围栏包短围栏、frontmatter 内 `#` 排除且偏移量含 frontmatter 长度、`#nospace` 排除、4 空格缩进排除、空标题跳过、CRLF、引用块/列表/HTML 注释内标题不收（已知差异钉住）；
- `frontmatter.ts` 追加 `splitFrontmatter` 用例：有 frontmatter 返回块长度＋解析对象、无返回 `blockLength 0`＋null、YAML 损坏返回 `blockLength 0`＋null（块内 `#` 行按正文处理，与阅读态一致）；`parseFrontmatter` 旧用例全量保留；
- `TocPanel.test.tsx` 追加：有 `onJump` 时点击调 `onJump(idx)` 且 `scrollIntoView` 未调（注意既有文件全局 mock `scrollIntoView` 无 restore，新增用例做好隔离）；旧用例保留作回归；
- `ContentView.test.tsx` 追加：编辑态＋`tocOpen` 渲染边栏（`aside` 的 `aria-label` 即 `toc.title`，无障碍名定位），点击后 textarea 选区落在标题行（CRLF 下不含 `\r`）；阅读态用例不受影响；
- 命令：`npm test --workspace=packages/app -- src/features/content-browser/markdown-toc.test.ts src/features/content-browser/TocPanel.test.tsx src/features/content-browser/ContentView.test.tsx`，外加 `npm run lint --workspace=packages/app` 与 `npm run typecheck --workspace=packages/app`；
- 合并前不跑桌面 E2E：`packages/desktop/e2e/` 下无覆盖编辑态的 spec（仅 `floating-content-browser.spec.ts` 与编辑态无关），本次只跑组件测试＋人工目检；不新增 E2E spec，不依赖 edit-search-shift 的 spec；
- 人工：长 md（含围栏代码块、setext 标题、前言 frontmatter）进编辑开大纲逐项点，确认目标行居中且整行选中；改窗口高度后重跳；大纲打开时长行不断行时确认无横向溢出。

## 六、范围与不做

- 不改阅读态大纲、`useContentToc`、查找条；
- 不做滚动位置跟随高亮、不做快捷键、不做顶栏下拉；
- 非 markdown 文件无大纲（沿用 `tocAvailable`）；
- 不新增 i18n key、contracts、server/API；
- 实现时若 `edit-search-shift` 已合，`textarea-reveal.ts` 直接 import；否则本 feature 建模块（bugfix design §2 已同步该落点）。

## 七、验收与改动清单

改动文件：

- 新增 `packages/app/src/features/content-browser/markdown-toc.ts`、`markdown-toc.test.ts`；
- `packages/app/src/features/content-browser/frontmatter.ts`（新增 `splitFrontmatter` 并收敛 `parseFrontmatter`）＋ `frontmatter.test.ts`；
- `packages/app/src/features/content-browser/textarea-reveal.ts`（新增，先合者建；导出 `measureMatchCenter`/`scheduleCenter`/`cancelCenter`）；
- `packages/app/src/features/content-browser/TocPanel.tsx`（`onJump`＋`containerRef` 可选）＋ `TocPanel.test.tsx`；
- `packages/app/src/features/content-browser/ContentView.tsx`（编辑分支接线＋`readTocVisible`）＋ `ContentView.test.tsx`；
- `packages/app/src/features/content-browser/Header.tsx`（去 `!isEditing`；`Header.test.tsx` 无需改，`tocAvailable` 默认 false）。

验收标准：

- md 文件编辑态点顶栏大纲按钮出现边栏；点任意标题行选中整行并居中；
- 4 级以下标题、围栏内标题不入列；引用块/列表/HTML 注释内标题不入列；
- 面板关闭时输入无卡顿（deferred 生效）；
- 非 md 文件无大纲按钮；loading/error 下按钮可见但面板不渲染；
- 组件测试、lint、typecheck 通过；人工按 §五 走完上中下三处跳转与窗口缩放。

文档同步声明：无 `docs/official`、i18n、contracts、server 变更；`research.md` §1 决策（只做边栏）由本文落实，无需回改。
