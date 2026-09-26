# Agent 聊天主题改写：前导注释导致选择器作用域判定错误

- 日期：2026-09-21（发现） / 2026-09-26（草案）
- 状态：草案，未实施
- 影响文件：`packages/app/src/features/chat/hooks/useAgentTheme.ts`（`scopeSelector` 100-113、`scopeRuleBlock` 115-136）
- 相关测试：`packages/app/src/features/chat/hooks/useAgentTheme.test.ts`
- 影响版本：0.3.3（安装版 `app.asar` 复跑确认）

## 现象

主题文件规则块的选择器之前有一段顶层注释时，整块（含块内全部嵌套规则与其 `@media` 分支）不命中，表现为「主题没生效」：`--sp-*` 变量为空、背景不绘制、气泡圆角/配色回到项目默认值。


失败面随嵌套写法放大：嵌套主题把全部规则挂在同一个被注释前缀的根块里，根块一死全死，容易被误判为「渲染内核不支持 CSS nesting」。实测内核支持 nesting，这条结论是误判。

## 根因

CSS 注释等价于空白，但改写函数按**原始字符串开头**判定分支，注释在前即走错路。`splitTopLevel`（15-68）以顶层 `}` 切块，块前的注释会并入后一个块，于是进入 `scopeRuleBlock` 的 `block` 形如：

```css
/* ==================== 主题 banner ==================== */
[data-chat-root] { --sp-primary: #a8382c; }
```

### 1. `scopeRuleBlock` 把 `@media` 当普通选择器

`selectorText = block.slice(0, brace).trim()`（118），`!selectorText.startsWith("@")`（120）判定失败——开头是 `/*`。于是 `@media (prefers-color-scheme: dark)` 被当选择器交给 `scopeSelector`，走兜底分支拼成 `[data-chat-instance="…"] /* banner */ @media (…) { … }`，不是合法选择器，整个暗色分支被丢弃。

### 2. `scopeSelector` 兜底分支生成永不命中的选择器

`scopeSelector` 的三个前缀判定（`&`、`[data-chat-root]`、`[data-chat-float-root]`）都只看开头（103-109）。注释在前 → 落到 `return `${scope} ${trimmed}``（112），生成：

```css
[data-chat-instance="<sessionId>"] /* banner */ [data-chat-root] { … }
```

`data-chat-instance` 与 `data-chat-root` 挂在**同一个元素**上，`[data-chat-root]` 不可能是自己的后代，该规则永不命中。

问渠恰好块与块之间没有顶层注释，因此是唯一正常的样本。

## 复现

1. 取任一 `theme.css`，在某个规则块的选择器前放一行顶层 `/* … */`；
2. 打开该 agent 聊天会话，在该页 Console 执行：

```js
getComputedStyle(document.querySelector('[data-chat-root]')).getPropertyValue('--sp-primary').trim();
```

3. 返回空串或项目默认值（如 `#d98aa6`）即为命中本 bug；无注释对照应返回主题值。

## 修复方案

原则：**判定前先剥掉前导注释，判定后原样吐回**。无注释输入时输出与现有实现完全一致，保证零回归。

```ts
const LEADING_COMMENTS = /^(?:\s*\/\*[\s\S]*?\*\/)+/;

function stripLeadingComments(text: string): { lead: string; rest: string } {
  const lead = LEADING_COMMENTS.exec(text)?.[0] ?? "";
  return { lead, rest: text.slice(lead.length) };
}

function scopeSelector(selector: string, scope: string): string {
  const { lead, rest } = stripLeadingComments(selector);
  const trimmed = rest.trim();
  if (!trimmed) return selector;
  let scoped: string;
  if (trimmed.startsWith("&")) {
    scoped = scope + trimmed.slice(1);
  } else if (trimmed.startsWith("[data-chat-root]")) {
    scoped = `[data-chat-root]${scope}${trimmed.slice("[data-chat-root]".length)}`;
  } else if (trimmed.startsWith("[data-chat-float-root]")) {
    scoped = trimmed;
  } else {
    const rootMatch = /^(:(root)|html|body)(?=[\s:.,[#>+~]|$)/.exec(trimmed);
    scoped = rootMatch ? scope + trimmed.slice(rootMatch[0].length) : `${scope} ${trimmed}`;
  }
  return lead ? `${lead} ${scoped}` : scoped;
}

function scopeRuleBlock(block: string, scope: string): string {
  const brace = block.indexOf("{");
  if (brace === -1) return block;
  const { lead, rest } = stripLeadingComments(block.slice(0, brace));
  const selectorText = rest.trim();
  const body = block.slice(brace);
  if (!selectorText) return block;
  if (!selectorText.startsWith("@")) {
    const scoped = splitSelectors(selectorText)
      .map((s) => scopeSelector(s, scope))
      .join(", ");
    return `${lead}${scoped} ${body}`;
  }
  const nameMatch = /^@([a-z-]+)/i.exec(selectorText);
  const name = nameMatch?.[1].toLowerCase() ?? "";
  if (GLOBAL_AT_RULES.has(name)) return block;
  const bodyEnd = body.lastIndexOf("}");
  if (bodyEnd === -1) return block;
  const inner = body.slice(1, bodyEnd);
  const scopedInner = splitTopLevel(inner)
    .map((part) => scopeRuleBlock(part, scope))
    .join("\n");
  return `${lead}${selectorText} {\n${scopedInner}\n}`;
}
```

要点：

- `scopeRuleBlock` 用剥离后的 `selectorText` 判 `@`，注释仍在 `@media` 之前原样输出；
- `scopeSelector` 对逗号列表中的每个选择器独立处理前导注释，覆盖 `a, /*x*/ b` 形态；
- 选择器中间（非前导）的注释不受影响，`[data-chat-root] /*x*/ [data-chat-header]` 仍走根前缀分支。

### 边界与已知限制

- `block.indexOf("{")` 若首个 `{` 落在前导注释内部（`/* { */ [sel] {`），当前与修复后都会取错位置。属既有行为，本次不改；如需一并处理，应改为「跳过注释/字符串后定位首个 `{`」。
- 修复后无需回滚任何主题文件；此前为绕过而把注释「搬进块内」的写法继续有效。

## 测试

在 `useAgentTheme.test.ts` 补充：

1. 无注释回归：现有全部用例输出不变；
2. `/*c*/[data-chat-root] { … }` → 注释保留，且生成 `[data-chat-root][data-chat-instance="s1"]`，不含 `[data-chat-instance="s1"] [data-chat-root]`；
3. `/*c*/ @media (prefers-color-scheme: dark) { [data-chat-root] { … } }` → `@media` 保留，内层正确作用域；
4. 连续/多行前导注释 `/*a*//*b*/\n[sel] { … }`；
5. 逗号列表 + 中间注释；
6. 前导注释 + `:root` / `html` / `body` / `&` 各分支。

验证链：`npm test --workspace=packages/app`；对 5 份真实主题 + 官方样例跑 `prepareAgentThemeCss`，输出过 postcss 解析且可用规则 > 0；真机 Edge 读 `--sp-primary`，亮/暗各验一次。

## 影响面

- 纯 renderer 侧字符串处理，无数据迁移、无契约变更；
- 仅改变「块前有前导注释」的输入路径，其余输入逐字节不变；
- 无注释主题与当前行为一致，可安全合入。

## 代码调研补充（2026-09-26，对照仓库现状）

- 行号引用全部命中：`splitTopLevel` 15-68、`splitSelectors` 70-98、`scopeSelector` 100-113、`scopeRuleBlock` 115-136、`scopeAgentThemeCss` 138-144、`GLOBAL_AT_RULES` 6-13。根因链逐行成立：
  - `scopeSelector` 101 先 `trim()` 再三次 `startsWith`（`&` / `[data-chat-root]` / `[data-chat-float-root]`），前导 `/*` 直接落到 112 兜底 `` `${scope} ${trimmed}` ``；
  - `scopeRuleBlock` 116 `indexOf("{")` + 118 `slice(0, brace).trim()` + 120 `startsWith("@")`，注释在 `@media` 前即误判为普通选择器；126 的 `nameMatch = /^@([a-z-]+)/i` 同样会被前导注释挡住，修复方案覆盖了这一路。
- `splitTopLevel` 已是注释感知（`inComment` 19 / 23-29 / 39-43，字符串感知 31-47），注释块会并入后一个顶层块——提案"块前的注释会并入后一个块"属实。反例：`splitSelectors` 只处理字符串与 `(`/`[` 深度（70-98），对注释无感，所以 `a, /*x*/ b` 的第二个选择器同样带前导注释中招；修复方案对逗号列表逐项剥离是对的。
- "已知限制"属实且可补一条：116 的 `indexOf("{")` 既不跳注释也不跳字符串，属性选择器内的 `{`（如 `[data-x="{"]`）同样会取错位置，与注释是同一类缺陷。
- `@media` 不在 `GLOBAL_AT_RULES`（`font-face` / `keyframes` / `import` / `charset` / `namespace` / `scope`）中，会走递归分支——现有测试 28-35 行已覆盖无注释 `@media` 递归，37-42 行覆盖 `@font-face` / `@keyframes` 直通。测试文件共 167 行，**无任何前导注释用例**，提案的 6 条测试计划均为新增、无重叠。
- 提案修复片段中的 `:root` / `html` / `body` 分支与现状 110-111 的 `rootMatch` 正则一致，实现时直接复用该正则即可，无需新写。

## 修复方案（2026-09-26 定稿，按本节执行）

目标：判定选择器/`@` 前先剥前导注释，再原样吐回。无注释输入逐字节不变（例外：无注释的退化逗号列表如 `, .a` 保持原样含空元素；有注释输入允许空白归一化，语义等价）。

改 `packages/app/src/features/chat/hooks/useAgentTheme.ts`：

- 加 `LEADING_COMMENTS` + `stripLeadingComments`（见原"修复方案"节代码，以该节为准）；
- `scopeSelector`：对每个选择器剥注释后再走 `&` / `[data-chat-root]` / `[data-chat-float-root]` / `:root|html|body` / 兜底；剥完 rest 为空（纯注释元素，如 `a, /*c*/`）时返回空串，由调用方丢弃，不拼非法选择器；
- `scopeRuleBlock`：对 `{` 前文本剥注释后再 `startsWith("@")`，`lead` 拼回输出；
- `{` 定位改为跳过注释/字符串后再取首个 `{`（复用 `splitTopLevel` 的扫描逻辑）：前导注释内含 `{`（如 `/* 主题 { banner */ [data-chat-root] {`）时旧 `indexOf` 会取错，本 bug 同类输入必须覆盖。

测试（`useAgentTheme.test.ts` 追加）：现有用例不动；`/*c*/[data-chat-root]{…}` → 含 `[data-chat-root][data-chat-instance="s1"]` 且不含后代选择器；`/*c*/ @media …` → `@media` 保留、内层正确；连续/多行前导注释；`a, /*x*/ b`；前导注释 + `:root` / `html` / `body` / `&`。

验证：`npm test --workspace=packages/app`；前导注释内含 `{`（如 `/* 主题 { banner */ [data-chat-root] { … }`）正确作用域。
