# HTML 直接点编辑无搜索按钮：方案

- 日期：2026-11-05
- 状态：已实现，待验收（code-review 无阻塞项，4 minor 已处理 3 项、1 项接受现状）
- 版本：v1.0.4
- 来源：同目录 `research.md`

## 一、结论摘要

`findable` 条件（`content-browser/index.tsx:100`）漏了编辑态豁免：HTML 以 `preview` 标签进编辑时残留 `htmlView==="preview"`，Header 放大镜按钮不渲染，`editFindOpen` 永假，`EditFindReplaceBar` 出不来。修法：把谓词抽成纯函数 `isFindable`（新文件 `content-browser/findability.ts`），豁免项追加 `isEditing`（§三），`index.tsx` 改为调用。

## 二、现状（file:line 实证）

- 标签初值：`index.tsx:40`（`htmlView` 默认 `"preview"`）；编辑入口唯一（`Header.tsx:167`，preview/source 共用 `onEnterEdit={editor.enterEdit}`，`index.tsx:117`）。
- `enterEdit` 不区分路径（`hooks/useContentEditor.ts:59-65`）：只置 `editedContent/editBaseline/isEditing`，不碰 `htmlView/editFindOpen`。
- 放大镜门控：`Header.tsx:88` `{findable && (<Button … onClick={onFindToggle}>)}`；`onFindToggle`（`index.tsx:122-125`）编辑态切 `editFindOpen`，阅读态切 `findOpen`。
- 搜索条渲染：`ContentView.tsx:230` `{editFindOpen && (<EditFindReplaceBar …/>)}`；清零只有退出编辑（`:185-187`）；`Ctrl/Cmd+F` 只判 `isEditing` 不判 `htmlView`（`:189-201`），所以快捷键两条路径都能打开。
- 编辑体两路径同一分支（`:227-237` 单一 `Textarea`），样式无差异；`预览/源码 ToggleGroup` 编辑时隐藏（`Header.tsx:132`）是合理设计——编辑态恒走 `isEditing` 分支，切 tag 是 no-op，本次不改。

## 三、方案

把门控谓词抽成纯函数（新文件 `content-browser/findability.ts`，与既有 `file-kind.ts` 同类），`index.tsx:100` 改为调用：

```ts
// findability.ts
export interface FindableInput {
  loading: boolean;
  error: string | null;
  binary: boolean;
  isImage: boolean;
  isHtml: boolean;
  htmlView: "preview" | "source";
  isEditing: boolean;
}

export function isFindable(i: FindableInput): boolean {
  if (i.loading || i.error || i.binary || i.isImage) return false;
  if (i.isEditing) return true;
  return !(i.isHtml && i.htmlView === "preview");
}
```

语义：编辑态下永远可搜编辑区（编辑区是纯文本 `Textarea`，与 `htmlView` 无关）；阅读态保持原逻辑。抽函数只为可测性——该条件已有 `Header.test.tsx` 传值绕过的先例，直接内联无法被单测钉住。

已否决的备选：
- `Header.tsx:88` 改 `{(findable || isEditing) && …}`：改动更小且 Header 已有测试宿主，但把门控拆到容器和 Header 两处，语义隐晦。
- `enterEdit` 内强制切 `source`：丢"下次打开仍是 preview"的预期，且只治标（`findable` 语义仍错）。

非目标：不改 `enterEdit`；不改阅读态 `FindBar` 门控（`ContentView.tsx:119-126`，与本 bug 无关）；不改 ToggleGroup 的 `!isEditing` 隐藏。已知不一致（`findable` 缺 `content !== null` 检查而 `findEnabled` 有）无实际影响（进编辑必有内容），不处理。

## 四、测试

- 新增 `findability.test.ts`：状态矩阵全覆盖——(html, preview, 非编辑)=false；（html, preview, 编辑）=**true（本次修复点）**；(html, source, ±编辑)=true；(非 html, ±编辑)=true；loading/error/binary/image 任意组合=false。
- 交互回归（新文件 `ContentBrowser.test.tsx`，复用 `ContentView.test.tsx` 的 render harness 模式）：`preview→编辑` 与 `source→编辑` 下 `getByRole("button", { name: "查找" })` 存在，点击后出现 `[data-content-edit-findbar]`（`EditFindReplaceBar.tsx:102`）；新增退出编辑用例：取消编辑后放大镜消失、查找条关闭（`onFindToggle` 分流，`index.tsx:122-125`）。
- `Ctrl+F` 两路径不断言新增（已有 handler 逻辑；新增 `htmlView` 条件的回归由矩阵覆盖语义，handler 本就不查 `htmlView`）。
- 现有用例全量回归（`ContentView.test.tsx`、`Header.test.tsx`、`EditFindReplaceBar.test.tsx`）。

## 五、验收与改动清单

改动文件：`content-browser/index.tsx`（改 1 行调用）＋ 新文件 `content-browser/findability.ts` ＋ `findability.test.ts` ＋ `ContentBrowser.test.tsx`（交互用例）。code-review 结论：查找条断言用 `[data-content-edit-findbar]` 保留（app README 语义查询优先，但该钩子是代码库自有稳定钩子，等价可接受）。

验收：HTML 文件 `preview→编辑` 与 `source→编辑` 下 Header 放大镜都可见，点击都弹出查找替换条；阅读态 preview 下放大镜仍隐藏（iframe 内无文本可搜）；lint、typecheck 通过。

## 六、文档同步

- `Changes.md`：v1.0.4（stable 未发，同周期）加一条修复："修复 HTML 文件直接点编辑时搜索按钮缺失（从源码页进入则正常）"。
- `project-structure.md`：`content-browser` 行（feature 行为级描述，不逐文件枚举）补一句"含搜索可见性纯函数 `findability`"——若评审认为该行粒度不收单文件，可免。
- i18n / `data-conventions.md` / 各包 README：无影响（无新文案、无数据格式、无包规则变更）。
- backlog：新增一条"统一 content-browser 查找可见性判定（`index.tsx` 的 `findable` 与 `ContentView.tsx` 的 `findEnabled` 两套相似门控，漂移风险；本次 bug 即同源）"，放技术债节。
