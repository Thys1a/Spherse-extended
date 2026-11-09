# HTML 直接点编辑无搜索按钮：调研

- 日期：2026-11-05
- 状态：已定位，待修复
- 现象：HTML 文件直接点"编辑"时没有搜索按钮（放大镜），先点"源码"再点"编辑"就有。

## 一、结论摘要

不是两个编辑器，是**同一个编辑器**在 `htmlView=preview/source` 不同标签下进入。`Header` 放大镜按钮被 `findable` 条件藏掉（`content-browser/index.tsx:100` 漏了编辑态豁免），导致 `preview→编辑` 时 `editFindOpen` 永远没入口置 `true`，`EditFindReplaceBar` 渲染条件永假。

## 二、复现链路（file:line 实证）

- `htmlView` 默认 `preview`：`features/content-browser/index.tsx:40`。
- 唯一的"编辑"按钮（preview/source 共用）：`features/content-browser/Header.tsx:153-170`，`onClick={onEnterEdit}`。
- `enterEdit` 不区分路径（`features/content-browser/hooks/useContentEditor.ts:59-65`）：只置 `editedContent/editBaseline/isEditing`，不碰 `htmlView/editFindOpen`。
- 编辑器本体单一分支（`features/content-browser/ContentView.tsx:227-237`），无 mode/prop 区分；`isHtml && htmlView==="preview" && !isEditing` 时才走 iframe 预览（`:203`）。

| 路径 | 进入编辑时的 `htmlView` | 放大镜 | 搜索条 |
|---|---|---|---|
| 直接点编辑 | `preview`（初始值） | 无 | 无 |
| 源码→编辑 | `source`（`onHtmlViewChange=setHtmlView`，`index.tsx:120`） | 有 | 有 |

## 三、根因

`index.tsx:100`：

```ts
const findable = !loading && !error && !binary && !isImage && !(isHtml && htmlView === "preview");
```

漏了 `isEditing` 豁免。编辑态下内容已是纯文本 `Textarea`，`htmlView` 残留值不应再决定"能否搜编辑区"。连锁：`findable=false` → `Header.tsx:88` 不渲染放大镜 → `editFindOpen`（`index.tsx:44` 初值 `false`）无按钮置 `true` → `ContentView.tsx:230` 的 `{editFindOpen && <EditFindReplaceBar/>}` 永假。

搜索条唯一的两个置 `true` 入口：Header 放大镜（`index.tsx:122-125`）与 `Ctrl/Cmd+F`（`ContentView.tsx:189-201`，只判 `isEditing` 不判 `htmlView`——所以快捷键在两条路径下都能打开，可作验证手段）。清零只有退出编辑（`ContentView.tsx:185-187`）。

## 四、其它同类 UI 差异（已证伪/确认）

- `预览/源码 ToggleGroup` 编辑时消失（`Header.tsx:132` `{isHtml && !isEditing && ...}`）：路径 A 用户被锁死在不可见的 preview 标签下，进编辑后无法切 source 自救。
- 编辑区 DOM/CSS 两路径完全一致（单一 `Textarea`，`ContentView.tsx:227-259`）；`分屏/取消分屏` 皆 `!isEditing` 才显示；`EditFindReplaceBar` 挂载即抢焦点行为一致（`:39-42`）。
- 读模式 `FindBar` 门控含 `!isEditing`（`ContentView.tsx:119-126`），与本 bug 无关。

## 五、修复方案（未实施）

首选改一行（语义：编辑态下永远可搜编辑区），`index.tsx:100`：

```ts
const findable = !loading && !error && !binary && !isImage && !(isHtml && htmlView === "preview" && !editor.isEditing);
```

备选（不推荐）：`enterEdit` 内或 `index.tsx:117` 包一层先 `setHtmlView("source")`——丢"下次打开仍是 preview"的预期，且 `findable` 语义仍错。

验证：HTML 文件分别以 `preview→编辑` / `source→编辑` 进入，断言 Header 放大镜可见、点击后出现 `data-content-edit-findbar`（`EditFindReplaceBar.tsx:102` 测试钩），`Ctrl+F` 两路径都生效；补组件用例。
