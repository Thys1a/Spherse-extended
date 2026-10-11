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

## 追加调研（2026-09-26）：注入链路断裂——本篇修的选择器 bug 当前打在死代码上

用户反馈：agent 主题完全无显示，`style[data-agent-theme]` 数量为 0，root 无 `data-chat-instance`，只有项目主题生效。逐项核对用户给的三个排查方向，结论如下。

### 1. 现象与定位：不是"没命中"，是"没注入"

- `style[data-agent-theme]` 全仓零命中：`packages/` 下无任何源码（含 desktop preload、web、landing）创建该元素；`data-chat-instance` 仅出现在 `useAgentTheme.test.ts` 的期望字符串里。用户探针（数量 0、无 instance 属性）与现状代码完全一致。
- `scopeAgentThemeCss` / `prepareAgentThemeCss`（`[data-chat-instance]` 整套作用域机制，含本篇的前导注释修复）**零生产调用者**，仅测试 import。本篇已合入的修复当前是 inert 的，恢复注入后才会生效。

### 2. 断裂点：`Chat` 把 CSS 文本当 URL 喂给 `<link>`

`packages/app/src/features/chat/index.tsx:86,191-192`：

```tsx
const themeHref = useAgentTheme(client, agent.id, agent.slug, projectId);
// ...
<div ref={rootRef} className="flex flex-col h-full" data-chat-root>
  {themeHref && <link rel="stylesheet" href={themeHref} />}
```

但 `useAgentTheme`（`hooks/useAgentTheme.ts:277-337`）返回的是 **CSS 文本**（`client.getAgentTheme(id)` 即 `GET /api/projects/:id/agents/:agentId/theme` 的 `res.text()`，服务端 `server/src/routes/agents.ts` 以 `text/css` 直吐文件内容）。于是实际渲染的是 `<link rel="stylesheet" href=":root { --sp-… } …">`——浏览器请求非法 URL 静默失败；主题为空时 `themeHref === ""`，link 根本不渲染。两种情况都是零样式，与上报症状逐字相符。

逐条回复排查方向：

- **读取路径无辜**：`getAgentTheme → projectManager.getAgentTheme → .spherse/agents/{slug}/theme.css` 文本链完好，hook 内 fs-watch 订阅（`agents/${slug}/theme.css` 后缀匹配）、250ms 防抖、断线重连补偿都在。问题不在读取。
- **注入方式是断裂处**：有效的注入应是 `<style data-agent-theme>`（见下节历史），`style[data-agent-theme]` 全仓零命中证实新机制从未挂载。
- **会话-agent 映射无辜**：`Chat` 直接收 `agent` prop（`agent.id` / `agent.slug`），`useAgentTheme(client, agent.id, agent.slug, projectId)` 直连，不存在"映射失败静默跳过"环节。

### 3. 历史：上游合并把两个时代的半边拼在了一起

- merge 前（`d1b2c2d` 之前）：`useAgentTheme` 返回**预览 URL**（`client.getPreviewUrl('.spherse/agents/{slug}/theme.css')`），`<link href={url}>` 能加载但**无作用域隔离**（全局泄漏）。
- `d1b2c2d`（09-12）：hook 改返回 CSS 文本，注入改为 `<style data-agent-theme={sessionId}>{scopedThemeCss}</style>` + root `data-chat-instance={sessionId}`；09-13（`9f48073`）再补 asset 改写。即"文本 + 内联 style + 会话隔离"时代。
- `419b4e0`（09-25，上游合并）：用上游版 `Chat` 覆盖，把 `<link href={themeHref}>` 的 JSX 捡了回来，但 hook 保留在文本时代——变量名相同、类型相反，merge 解决时未发现。`git log -S data-agent-theme -- index.tsx` 只能看到 d1b2c2d 的引入，删除发生在 merge 的整文件重写里。

### 4. Skill 口径对照

- `spherse-create-agent-chat-theme` 层叠章写的"chat 容器内后载入的 `<link>`"描述的是 merge 前时代（URL + link），在当前代码下不成立；`spherse-use-ui-sdk` 的表述同理。待注入恢复后，这两处应按实际机制回写（内联 `<style>` + 会话隔离），否则继续误导。
- 项目主题（`.spherse/theme.css` 经 `document.head` 的 `<link>`，`useCustomTheme` 组 preview URL）链路独立且完好——这正是"只有项目主题生效"的原因。

### 5. 修复方向（已按 A 实施：Chat 恢复内联 `<style>` 注入 + `data-chat-instance`，见本分支后续 commit）

- **推荐 A**：在 `Chat` 恢复内联注入（按新组件签名改写 d1b2c2d 的 hunk）：root 加回 `data-chat-instance={sessionId}`，`{scoped && <style data-agent-theme={sessionId}>{scoped}</style>}`，其中 `scoped = prepareAgentThemeCss(css, sessionId, '.spherse/agents/${slug}', previewUrl)`。恢复后本篇的前导注释修复自动生效；保留会话隔离的初衷。
- **不采纳 B**：把 hook 改回返 URL + link——开倒车回全局泄漏，与 d1b2c2d 的隔离设计冲突。
- 复核点：`document.querySelector('[data-chat-root] link')` 的 href 在 devtools 里直接可见（将是一整段 CSS 文本），一分钟可证实；浮窗聊天若走同一 `Chat` 组件则同修，否则另查入口（当前 `useAgentTheme` 仅 `features/chat/index.tsx` 一处调用）。
- 本篇原"验证链"（postcss/真机读 `--sp-primary`）以注入恢复为前提，在此之前跑真机只能复现 0 注入。
