# 文件列表操作（空白右键 / 重命名 / 拖动移动）

> 状态：**调研完成，未实施**。本文沉淀调研结论与推荐方案，供后续立项排期。

## 背景

用户希望文件列表（`FileTree`）操作更方便：空白处右键菜单、文件与文件夹重命名、文件拖动移动。当前三项全部缺失。

## 现状

- 文件列表 = `FileTree`（`packages/app/src/components/file-tree/`），挂在 `UserFilePanel`（`packages/app/src/features/user-file-panel/index.tsx`）。
- 已有：按节点右键菜单（浮窗/新建文件/新建文件夹/复制路径/删除，`FileTreeContextMenu.tsx`）、`InlineNameInput`（仅用于**新建**）、删除确认框、展开状态、`invalidateProjectFileQueries` 刷新。
- 右键菜单按节点触发，列表容器本身无 trigger；树内零 DnD（全仓仅 TabStrip 用原生 HTML5 拖拽）。

## 调研结论

### 重命名/移动缺服务端接口，但有现成模板

- content 路由（`packages/server/src/routes/content.ts`）只有 mkdir/touch/save/delete；`ProjectManager` 只有 write/create/delete/copyFileWithin，**无 move**。
- Agent 侧 `core/tools/move-file.ts` 已实现完整语义：`resolveProjectPath` + 读写 access policy + 目标已存在则失败 + 防移入自身 + mutex + EXDEV 跨盘回退——UI 侧复用同一套安全模型，不另起炉灶。
- 按仓库红线：新增 HTTP 边界走 `@spherse/contracts` 加 schema（参照 `contentCreateRequest`），`ApiClient` 加方法。

### 三项的接缝

1. **空白处右键**：纯前端。只保留**单个容器级 `ContextMenu`**（不做节点菜单+容器菜单双层嵌套），在 `onContextMenu` 用 `event.target.closest('[data-path]')` 判断点中节点还是空白，据此渲染菜单项；空白落点菜单项复用 `requestCreate`（父目录取 `basePath`）。
2. **重命名**：前后端。contracts 加 `contentMoveRequest { destination }`，`contentCreateRequest` 扩为判别式联合（`mkdir|touch|move`，`POST .../content/*` 已被 create 占用、不可同 method+path 新增路由）；`ProjectManager` 加 `moveEntry`（照抄 move-file 校验 + mutex，src+dest 双锁固定顺序，跨盘回退可省）；前端复用 `InlineNameInput`（加 `initialValue`），右键菜单加"重命名"项。
3. **拖动移动**：纯前端。原生 HTML5 DnD（与 TabStrip 一致，不引新库）：行 `draggable` + 目录 hover 高亮 + drop 调 move 接口；仅做"移动到目录"，不做同级排序（树按名排序，无自定义顺序语义，避免引入 order 持久化）；落点仅目录，拦截拖入自身/自身后代/原父目录（对齐 `move-file.ts`）。

### 重命名/移动的连带更新（易漏）

- `invalidateProjectFileQueries`（old+new 双路径）、expandedPaths、selectedFile。
- 已打开的 content tab/路由：目录改名/移动须按前缀重映射**其下所有后代 tab**（单文件 close 旧 path + open 新 path 不够）；tab-store 加 `remapPaths` 或 close+open 循环。
- 正在编辑且有未保存修改的文件：新增轻量 dirty-path 注册表（`useContentEditor` 进出编辑上报），改名/移动前检查并 toast 中止（`isDirty` 为局部状态，文件树直接拿不到，不做注册表则守卫无法实现且有写回旧路径复活文件的 bug）。
- AI 读写 denylist 同样约束用户手操作（与现有 delete/mkdir 一致）。

## 推荐方案（未实施，按序独立交付）

1. 空白处右键（约 30 行 + i18n key）。
2. 重命名（含 move 接口，一并支撑拖动）。
3. 拖动移动。外部系统文件拖入树内属上传/导入，另立项，不在本轮。

## 已知风险

- 改名/移动走 `serverAccessPolicy`，denylist 内路径会被拒（与既有一致）。

## 验证思路（实施时）

- contracts 单测：move request schema 校验。
- core 单测：`moveEntry` 目标已存在/移入自身/越权三例（对齐 move-file tool 测试）。
- desktop/server：content move 路由契约测试。
- app 组件测试：空白菜单渲染/新建落点；重命名提交/取消；拖放 drop 调 move。
- 手动：改名已打开文件 tab 跟随、denylist 拒绝 toast、拖动 hover 高亮。

---

## 增补调研（2026-09-10）：默认同标签页面打开 + 右键新标签/浮窗，标签右键 close all/other

> 状态：**调研完成，未实施**。默认行为零改动，两项均为右键菜单增量。

### 1. 默认同标签打开，右键新标签页面/浮窗打开

**现状（已验证代码）：**

- 左键点击文件已是"同文件复用同一标签"：`FileRow onClick → selectFile`（`packages/app/src/components/file-tree/FileTreeNode.tsx:37`）→ `UserFilePanel handleSelectFile` 仅 `navigate(.../content?path=)`（`packages/app/src/features/user-file-panel/index.tsx:31-34`）→ `use-tab-route-sync.ts:12-21` 经 `routeToTabSpec`（`tab-route.ts:26-30`，`content?path=X → {kind:"content", filePath:X}`）调 `tab-store.openTab` → `identityOf` 以 `content:${filePath}` 去重，已存在仅激活（`tab-store.ts:99-130`）。默认行为符合需求，**不改**。
- 文件右键菜单（`FileTreeContextMenu.tsx:30-61`，基于复用 `components/ui/context-menu.tsx`）现有项：浮窗/取消浮窗（仅文件行、仅 `onFloatFile` 传入时）/新建文件/新建文件夹/复制路径/删除；**无"新标签页打开"**。
- `readOnly`（`bridge.capabilities.content.editable==false`）时 `FileRow:45-47` 与 `DirectoryNode:120-127` 直接返回裸行，**整个右键菜单消失**（只剩左键）。
- 浮窗基础设施**已存在、无需新造**：`floating-content-browser/store.ts:52-71`（`openFloat` 幂等 + 级联偏移，`byProject: Record<projectId, Record<filePath, win>>`，持久化 `spherse:floating-content-browser`）+ `float-content.ts:5-15`（非 Electron 降级为 navigate 进主 Tab）+ `FloatingContentBrowserManager/Container`（`ProjectRuntimeBridges.tsx` 常驻，`createPortal(FloatingFrame)` 内嵌只读 `ContentView isEditing=false`，`onExpand = closeFloat + navigate` 回主 Tab）。限制：只读预览、仅 Electron（`floating-content-browser` 为 `ELECTRON_ONLY`，`UserFilePanel.tsx:28,64-71` 控制显隐）、与主 Tab 可共存。另有程序化通道 `ui-sdk/handlers/open-file.ts:5-17`（`openFile({path,float})`）。

**推荐方案：**

1. 文件行右键首段新增两项（与现有 `Float/CancelFloat` 对称）："在新标签页中打开" + "在浮窗中打开"（后者可复用现有 `float` 文案，或新增 `openInFloatingWindow` 语义等同幂等 `floatContent`，零 store 改动）。
2. 管道新增 `onOpenInNewTab?: (path:string)=>void`，经 `file-tree-context.tsx:18` + `FileTreeNode.tsx:24-32,50-55` + `UserFilePanel.tsx:64-71` 透传（抄现有 `onFloatFile`）。
3. `onOpenInNewTab` 实现：`useTabStore.getState().openTab(projectId, {kind:"content", label:basename, filePath:path}, {force:true})`；tabs 关闭时降级为 `navigate`。或统一走 `dispatchAction("openFile",{path,newTab:true})`（需扩展 `open-file.ts` 支持 `newTab`，便于 HTML 卡片复用，二选一）。
4. 门控：新标签项仅 `useFeature("tabs")` 时展示；浮窗项仅 `useFeature("floating-content-browser")` 时展示（Web 端隐藏，沿用现有逻辑）。
5. `readOnly` 分支放行纯打开类菜单（新标签/浮窗/复制路径），仍屏蔽新建/删除；需产品确认，否则只读项目右键继续整体缺失。
6. i18n 新增（三语言同步）：`file-tree.openInNewTab`、`file-tree.openInFloatingWindow`（或复用 `float/cancelFloat` 则只加前者）。

**唯一设计风险（`openTab` 强去重）：**

- 当前 `content:path` 强去重使"同一文件开两个标签"无法表达。新增 `openTab(projectId, spec, opts?:{force?:boolean})` 跳过去重直接建（备选：新增 `openTabForce`，二选一）。
- 连带：同 path 多 Tab 映射同一路由（`tabToRoute` 不变）；经核实风险低——切换同 path 的另一 Tab 时 effect#2 算出的 route 与 current 相等直接 no-op，不抖动。首期定义：路由只反映 activeTab 的 path，同 path 切换不触 navigate。

### 2. 标签页右键 close all / close other

**现状（已验证代码）：**

- `TabStrip.tsx:1-72` **无右键菜单**（无 `ContextMenu` import/`onContextMenu`）：每 Tab 为 `div[role=tab] draggable + onClick=activate`，拖拽排序 `onDragStart/Over/Drop → reorder`（`35-47`），单个 `X` 按钮 `stopPropagation + closeTab`（`56-66`）。测试仅覆盖渲染/激活/单关/拖拽（`TabStrip.test.tsx:64-106`）。
- store（`tab-store.ts:3-35,153-208`）：`byProject: Record<projectId,{tabs,activeTabId}>` + `openTab/closeTab/activate/reorder/clearProject`，持久化 `spherse:tabs`；`closeTab` 删后激活邻位（`tabs[min(idx,len-1)]`），删空建空 `home` 兜底。**无 `closeOthers/closeAll`**。
- i18n（`packages/i18n/src/locales/en.ts:515-517`，`zh-CN/zh-TW` 同 key）：仅 `tabs.list/home/closeTab`，**无 `closeOthers/closeAll`**。

**推荐方案：**

1. `tab-store.ts` 新增 `closeOthers(projectId, keepId)` + `closeAll(projectId)`（删空后同 `closeTab` 建 `home` 兜底 + `persist`），`closeOthers` 后 `activeTabId=keepId`；补 `tab-store.test.ts` 用例。约 20 行。
2. `TabStrip.tsx` 每 `div[role=tab]` 外包 `ContextMenuTrigger/Content`（抄 `FileTreeContextMenu.tsx:30-32` / `SessionRow.tsx:163-178`），菜单项"关闭 / 关闭其他 / 关闭全部"→ `closeTab/closeOthers/closeAll`；注意与原生 HTML5 拖拽（`draggable`）共存验证。`home` 空 Tab 允许关闭，删空后重建（与 `closeTab` 一致，已确认）。
3. i18n 新增（三语言同步）：`tabs.closeOthers`、`tabs.closeAll`（`tabs.closeTab` 已有，复用于单关项）。

### 3. 实施顺序与验证

1. 标签右键 close 系列（纯前端 + store 纯逻辑，约 20 行 store + 菜单包裹 + 2 个 i18n key，可独立交付）。
2. 文件右键新标签/浮窗（含 `openTab force` 语义缺口 + 路由同步验证 + 2 个 i18n key）。

- app 单测：`tab-store` closeOthers/closeAll（含删空回 home、keep 激活）；`TabStrip` 右键菜单渲染与回调；`FileTree` 菜单新增项回调（含 readOnly 放行分支）。
- 手动：左键默认复用不变；同文件强制新标签后切换/关闭/持久化；浮窗打开→展开回主 Tab→关闭；Web 端浮窗项隐藏；`home` Tab 关闭行为符合产品定义。

---

## 增补调研（2026-09-10续）：md 大纲快速跳转 + 文件列表 shift 多选

> 状态：**调研完成，未实施**。两项相互独立，可分开交付。

### 1. md 文件大纲列表与快速跳转

**现状（已验证代码）：**

- 渲染链路：`ContentBrowserPage.tsx:21,59-67` / `TabPanel.tsx:65-66,111-120`（单 `filePath` → `key={filePath}` remount `ContentBrowser`）→ `content-browser/index.tsx:26-49,95-143`（`Header` + `ContentView`，`TextSelectionSession` 以 render-prop 注入 `contentRef`）→ `ContentView.tsx:128-188`（html preview 走 iframe，编辑态直接返回 `Textarea:152-161`，否则 `div[scrollRef] + MarkdownContent|pre:164-187`）。md 判定 `file-kind.ts:9-15`；frontmatter 已剥离（`ContentView:60-63` + `frontmatter.ts:8-30`，`body` 才进渲染，`FrontMatterPanel` 另渲染）。
- 唯一 md 渲染器 `MarkdownContent.tsx:127-171`：`react-markdown@^10 + remark-gfm + rehype-slug`（`app/package.json:42,44-46`），document 态 `remarkPlugins=[remarkGfm]` + `rehypePlugins=[rehypeSlug]`；`h1/h2/h3` 仅换样式并 `{...props}` 透传 `id`（`27-36`），即 `rehype-slug` 生成的锚点 id 已在 DOM 上，**无需改渲染器**。自研 remark 仅 `remark-plain-structure`（chat `plain` 压平用，与大纲无关）。
- TOC 现状为零：全仓 `toc/outline/tableOfContents` 无 md 大纲命中（`outline` 均为 data `*.data.json` 与 `core outline.ts`）；无 TOC 提取、无大纲 UI、无 scroll-spy。唯一可抄的锚点跳转：`ContentView:79-84`（`resolveMarkdownLink` 判 `anchor` → `document.getElementById(anchor)?.scrollIntoView({smooth})`，`markdown-link.ts:15-33`）与 `MessageItem.tsx:39-52` 同模式。
- 编辑/预览：编辑态不渲染 md，大纲应复用 `findEnabled` 同款门控（`ContentView:98-105`：`!isEditing && !loading && !error && !binary && !isImage && !(isHtml&&preview)`），**仅预览态显示**。
- 挂载位置（已确认）：开关放 `Header` 搜索按钮旁（与 `onFindToggle` 对称），浮窗首期无大纲入口；面板为右侧内嵌 `aside w-56`。`ContentView:164-187` 为 `flex-col[FindBar? + div[mergeRefs(contentRef,scrollRef)].overflow-y-auto]`，无侧栏插槽/Drawer 可复用（`FindBar:34-38` 置顶条为布局参照）。注意 `Header` 与 `ContentView` 为兄弟节点，`tocOpen` 须像 `findOpen` 一样上提到 `index.tsx`，不可放 `ContentView` 内部。

**推荐方案：**

1. heading 提取用 **DOM 法、零新依赖**：`scrollRef.current.querySelectorAll("h1[id],h2[id],h3[id]") → {id,text,level}`；天然兼容 `rehype-slug` 去重与 frontmatter 剥离。不做 mdast 预扫（需自写 remark 且处理 slug 一致性，成本高）。不需要 `rehype-toc/remark-toc/unified`。
2. 跳转抄 `ContentView:82` 但**作用域化**：`container.querySelector('#'+CSS.escape(id))?.scrollIntoView({block:"start",behavior:"smooth"})`；现 `document.getElementById` 在多 `ContentView`/浮窗共存时可能串台，`id` 含中文/百分号编码时注意 `markdown-link.ts:35-41 safeDecode`。
3. 新增面：`features/content-browser/TocPanel.tsx + useContentToc.ts`（输入 `containerRef + docKey`）、`index.tsx` 加 `tocOpen` 状态（`Header` 开关 + 下传 `ContentView`，与 `findOpen` 同款），`ContentView` 右侧内嵌 `aside w-56`（改 `div` 为 `flex-row` 时勿断 `mergeRefs(contentRef,scrollRef):172` 与 `TextSelectionSession:42` 链）+ i18n key。scroll-spy 二期：`IntersectionObserver(root:scrollRef)` 即可。

### 2. 文件列表 shift 多选

**现状（已验证代码）：**

- 选择确为**单选、无多选**：`file-tree/index.tsx:13-15,39-42`（`selectedFilePath + onSelectFile`）→ `file-tree-context.tsx:6-21` 同签名 → `FileTreeNode.tsx:23-37`（`isSelected = path===selectedFilePath`，`TreeRow onClick={()=>selectFile(path)}` 裸点击，无 `shiftKey/metaKey/ctrlKey`/键盘处理）→ `tree-row.tsx:10-25` 纯 Button 换色（无 `aria-selected/multiselect`）。`file-tree/` 下 `selectedFilePaths/multiSelect/shiftKey` 零命中（`shiftKey` 仅 FindBar/Composer）。
- 消费方全是单选假设：`UserFilePanel:26,31-34` 与 `SkillPanel:32,36-39`（第二棵独立 `FileTree rootPath=".spherse/skills"`）选中即 `navigate(content?path=)`——shift 点若仍导航会破坏范围选择，需定"范围选择时只高亮不导航"；`ContentBrowserPage:59-67` / `TabPanel:65-120` 单 `filePath` 渲染，多选不改变预览模型；删除单目标（`useFileTreeController:98-128` `DeleteTarget→confirmDelete→client.deleteContent` + `expandedPaths` 剪枝 + `invalidate` + `onDeleted(path)`，路由回退 `contentPath===deleted||startsWith(deleted+"/") → navigate`）；右键单 `node` 菜单（float 仅文件/新建/复制单路径/删除单项）；新建与多选正交；树内**无重命名/无拖拽载体**（DnD 仅 TabStrip 排序 + floating-frame 移窗），批量拖动/重命名本次无载体、另立项。
- shift 范围缺有序可见列表：`buildTreeItems` 仅层内排序（目录优先 + `localeCompare`，`tree-model.ts:35-47`）；数据碎片懒加载（根一次 `useProjectDirectory(basePath)` + 每展开目录各自 query，`FileTreeNode:77-82`），中央无全量 children、无 `flattenVisible` 派生函数。

**推荐方案：**

1. state 放 **`FileTree` 内部新 hook**（如 `useFileTreeSelection`：`{anchor, selected:Set, onRowClick}`）；`selectedFilePath(URL)` 保留为"主选中/预览项"（最后一次点击），新增可选 `selectedPaths?:Set + onSelectionChange?` 透出（`User/SkillPanel` 两树独立，上提会重复两份；跨 panel 共享工具条时再考虑上提）。
2. `FileRow onClick(e)` 改 `selectWithModifiers`：shift → `anchor..clicked` 在可见序切片（仅文件，范围选择只高亮不导航）；meta/ctrl → toggle 单项；普通 → 单选 + 导航。右键未选中行时先单选该行再出菜单。
3. `TreeRow` 加 `data-path` + `aria-selected`，选中判定改 `selectedPaths.has(path)`；`FileTreeContext` 加 `selectedPaths/anchor/selectWithModifiers`（保留旧字段兼容）。
4. 范围序用 DOM 顺序：`container.querySelectorAll('[data-path]')` 取 `anchor..clicked` 切片（与懒加载兼容；anchor 已折叠不可见时回退为仅选点击行）。不做 `flattenVisible`/childCache 上提。
5. 批量适配：`DeleteConfirmDialog + controller:98-128` 改多目标（`deleteContent` 复用 `Promise.allSettled` + 逐项 toast 复用 `deleteFailed`）；右键菜单选中数>1 时显示"删除 N 项/复制 N 条路径"，`float` 明确单文件才可用；`handleFileDeleted` 改收数组（`any(selected∋contentPath)` 即回退）；`ContentBrowser/TabPanel` 不动。

### 3. 实施顺序与验证

1. 大纲（纯前端，`TocPanel + useContentToc + ContentView` 分支 + `Header` 开关 + i18n，可独立交付；scroll-spy 二期）。
2. shift 多选（`selection hook + context + TreeRow data-path + flattenVisible`，再接批量删除/菜单；批量拖动/重命名不在本轮）。

- app 组件测试：大纲 heading 提取/点击跳转/编辑态隐藏/浮窗复用；多选 shift 范围/meta toggle/普通单选导航、`DeleteConfirmDialog` 多目标文案、批量右键分支。
- 手动：长 md 大纲跳转平滑滚动、中英文标题锚点；多选后预览项=最后一次点击、删除后路由回退、`Skill` 树独立选择互不干扰。

---

## 增补调研（2026-09-10续2）：md 阅读态 checkbox 勾选 + 编辑态搜索替换

> 状态：**调研完成，未实施**。两项相互独立，可分开交付。

### 1. md 阅读模式 checkbox 直接勾选

**现状（已验证代码）：**

- 渲染层无交互：`MarkdownContent.tsx:27-75/127-157` 仅覆盖 `h1/h2/h3/p/ul/li/code/pre/blockquote/table/a/img`，**无 `input` 覆盖、无 checkbox/onChange 逻辑**；`- [ ]/- [x]` 走 `remark-gfm` 默认行为渲染为 `disabled` 静态复选框（`app` 无 CodeMirror/Monaco；`remark-plain-structure.ts:37` 的 `[x]/[ ]` 转纯文本仅 `plain=true` 的 chat 链，阅读链不走）。`MarkdownContent.test.tsx:129-141` 无 task-list 基线。
- 保存链全量覆写、无行级接口：`useContentEditor.ts:82-97`（`save()` 以 `client.saveContent(filePath, editedContent)` 全量写回）→ `api.ts:257-265`（`PUT content/*`，`body:{content}`）→ `server content.ts:119-137`（`contentSaveRequest` 校验 string 后 `pm.writeFile`）→ `project-manager.ts:278-285`（`assertWrite + mutex + fs.writeFile` 全量覆写，无版本号/CAS）。勾选一项只能走**读-改-写全量文本**（last-write-wins）。
- 阅读态数据：`ContentView.tsx:60-63,177-181` 对 `content` 做 `parseFrontmatter` 后只把 `body` 给 `MarkdownContent`——checkbox 序号是**去 frontmatter 后的 body 顺序**，回写需处理偏移。

**推荐方案：**

1. `MarkdownContent` 加 `input` override（document 变体：去 `disabled` + 标 `data-md-task`）与 `onTaskToggle(taskIndex, nextChecked)` prop；**序号不用渲染期计数器**（StrictMode 双渲染下错位），改用 wrapper 上 `onChangeCapture` 事件委托：序号 = 该 checkbox 在 `container.querySelectorAll('input[type=checkbox]')` 中的位置（DOM 顺序 = remark-gfm DFS = 源码 task 行顺序，天然一致）。`chat` 变体不启用，保持只读。`ContentView:180` 传入。
2. 源码定位按 **task 序号映射行**：对 `body` 逐行扫描，第 N 个命中 task-regex 的行即第 N 个 checkbox；regex 需覆盖 `-/+/*`、`1.`/`1)`、引用与缩进：`^(\s*(?:>\s*)*\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]`，替换 `[ ]↔[x]`（统一小写 `x`）；**fence-aware**（跟踪 ```` ```/~~~ ```` 围栏，块内 `- [ ]` 不计数，约 10 行状态机；table cell 不产生 task 可忽略，`> - [ ]`/嵌套/有序均合法须覆盖，与 `remark-gfm` 文档顺序 DFS 天然一致）。frontmatter 偏移复用 `parseFrontmatter` 得 `body` 后替换再拼接（约 5 行），独立 `task-toggle.ts` + 单测。
3. 写回走独立 `useContentTaskToggle`（或 `index.tsx` 内）：`getContent 重读 → 替换 → saveContent → setContent`，**不新增 server 接口、不改 contracts**。门控：dirty 注册表命中（`isEditing && isDirty`）时拒绝覆盖草稿（toast/confirm，阅读区编辑态本不可见但需防呆）；toggle 前重读一次做 read-modify-write，重读与当前 `content` 不一致则提示刷新后重试（最小版；三方合并不做）；`saving` 期间禁用 checkbox，失败回滚 UI 并复用 `saveError` 条展示。

### 2. md 编辑模式搜索与替换

**现状（已验证代码）：**

- 编辑器=原生 `Textarea`：`ContentView:152-161` 编辑分支早返 `<Textarea value={editedContent}>`（`textarea.tsx:1-18` 原生透传），无 ref 转发、无 `scrollRef`、无富编辑器依赖（全仓 `codemirror/monaco` 零命中）；真相源为 `editedContent` state（`useContentEditor:40-46`），`Ctrl/Cmd+S` 保存（`:109-119`），无 `Ctrl+F` 处理。
- `FindBar` 纯阅读态 DOM 搜索：`FindBar.tsx:14-56`（`{containerRef, contentKey, onClose}`，`Enter→next/Shift+Enter→prev`，`Escape→关`）+ `useContentFind`（150ms 防抖）+ `find-engine.ts`（`TreeWalker` 采文本、`indexOf` 循环、`MAX_MATCHES=2000`、CSS Custom Highlight + `<mark>` fallback），**完全依赖渲染 DOM，对 `Textarea.value` 不可用**；无替换 UI。
- 编辑态明确禁用查找：`findEnabled = !isEditing && ...`（`ContentView:98-109`），`!findEnabled → setFindOpen(false)` + `Ctrl+F` 监听早返（`:112-126`），`Header:80-90` 搜索按钮 `findable && !isEditing` 才显示（`index.tsx:62` 的 `findable` 本身不含 `isEditing`，门控在上两处）。

**推荐方案（不换编辑器、不引新依赖）：**

1. `ContentView:152-161` 给 `Textarea` 加 `ref`（`textareaRef`），编辑分支上方渲染 `EditFindReplaceBar`（新建，或 `FindBar mode="edit"` 扩展二选一；**不可复用 `useContentFind`**/DOM 引擎，改调字符串版 `findMatches(editedContent, needle)`，`find-engine:31-45` 可复用，大小写敏感 flag 首期可不加）。
2. 替换条复用 `FindBar` 键位与样式（`Enter/Shift+Enter/Escape`、计数 `N/M` 文案）：第二 `Input`（替换文本）+ "替换/全部替换"按钮；导航：维护 `replaceIndex`，定位第 N 个 match `[start,end]` → `textarea.focus() + setSelectionRange + scrollTop`（替换后经 `useEffect` 恢复选区）；单个替换：`slice` 拼接后 `onEditedContentChange`，光标置替换后并重算 matches（offsets 失效）；全部替换：`split.join` 或自后向前 splice 并报告"共替换 N 处"（空替换=删除，加确认防误触）；`editBaseline` 不动，`isDirty` 语义自然成立。受控 state 下替换会丢失 textarea 原生 undo，本轮接受。
3. 门控：新增与阅读态 `findOpen` 独立的 `editFindOpen` 状态，`Ctrl+F` 在 `isEditing` 时开替换条；`Header` 搜索按钮编辑态也显示。`Ctrl+S` 保存逻辑不动。

### 3. 实施顺序与验证

1. 阅读态勾选（`MarkdownContent input` override + `task-toggle.ts` 行映射 + `useContentTaskToggle` 写回门控 + i18n toast 文案）。
2. 编辑态搜索替换（`EditFindReplaceBar` + `Textarea ref` + `editFindOpen` 门控）。

- app 单测：task 行映射（引用/嵌套/有序/fence 内不计数/frontmatter 偏移/大小写 `X`）、替换计数（大小写、全部替换、空替换）；`FindBar.test.tsx` 同级加字符串替换单测。
- 手动：阅读态勾选后文件落盘 `[x]`、有未保存草稿时拒绝覆盖、外部变更后提示刷新；编辑态替换导航光标与滚动、替换后 `isDirty` 与保存正常。

---

## 实施方案（已确认产品决策，未实施）

### 产品决策

1. 大纲开关：`Header` 搜索按钮旁（与 find 对称；浮窗首期无入口）。
2. 大纲布局：右侧内嵌 `aside w-56`。
3. shift 多选：仅文件可选。
4. 只读项目右键：放行纯打开类菜单（新标签/浮窗/复制路径），新建/删除仍屏蔽。
5. `closeAll`：允许关掉 home，删空后重建 home（与 `closeTab` 一致）。
6. checkbox 与搜索替换都要做，checkbox 优先。

### P1 文件列表基础操作

> 审查后修订：单容器菜单、move 判别式联合、dirty 注册表、后代 tab 重映射。

1. 空白处右键（纯前端）：单个容器级 `ContextMenu`，`onContextMenu` 用 `closest('[data-path]')` 区分节点/空白并渲染对应菜单；空白菜单项复用 `requestCreate`（父目录取 `basePath`，落点 `InlineNameInput depth=0`）。i18n 加 key。
2. 重命名（前后端）：contracts 加 `contentMoveRequest { destination }` 并把 `contentCreateRequest` 扩为判别式联合（`mkdir|touch|move`）；`ProjectManager` 加 `moveEntry`（照抄 `core/tools/move-file.ts` 校验 + src+dest 双锁固定顺序，跨盘回退可省）；前端复用 `InlineNameInput`（加 `initialValue`）+ 右键菜单加项；dirty-path 注册表（`useContentEditor` 上报，改名/移动前检查并 toast 中止）。连带：`invalidateProjectFileQueries(old+new)`、`expandedPaths` 前缀重映射、content tab 按前缀重映射后代、denylist 约束与 delete 一致。
3. 拖动移动（纯前端）：原生 HTML5 DnD，行 `draggable` + 目录 hover 高亮 + drop 调 move 接口；落点仅目录，拦截拖入自身/后代/原父目录；仅"移动到目录"，不做同级排序。外部文件拖入另立项。

### P2 标签页打开与关闭

1. `closeOthers(projectId, keepId)` + `closeAll(projectId)`（`tab-store.ts`，删空重建 home + `persist`，约 20 行）；`TabStrip` 每 tab 包 `ContextMenu`（关闭/关闭其他/关闭全部）；i18n 加 `tabs.closeOthers/closeAll`。
2. `openTab` 加 `opts?: {force?: boolean}` 跳过去重；`file-tree-context` + `FileTreeNode` + `UserFilePanel` 加 `onOpenInNewTab` 管道（仿 `onFloatFile`，tabs 关闭时降级 navigate）；`FileTreeContextMenu` 首段加"在新标签页中打开"，浮窗复用现有 `floatContent`；门控 `tabs` / `floating-content-browser`；只读分支放行打开类菜单；i18n 加 `file-tree.openInNewTab`。路由只反映 activeTab，同 path 切换不触 navigate。

### P3 md 大纲 + shift 多选

1. 大纲：`TocPanel.tsx`（右侧 `aside w-56`）+ `useContentToc.ts`（`containerRef + docKey`，`[data-content-doc] h1[id],h2[id],h3[id]`，零新依赖）；`tocOpen` 上提到 `index.tsx`（`Header` 开关 + 下传 `ContentView`，与 `findOpen` 同款）；`ContentView` 改 `flex-row`（勿断 `mergeRefs(contentRef,scrollRef)`）；门控复用 `findEnabled`（仅预览态）；跳转作用域化 `container.querySelector + CSS.escape`。scroll-spy 二期。
2. 多选：`useFileTreeSelection`（`{anchor, selected:Set}`，仅文件）；`FileRow onClick` 改 `selectWithModifiers`（shift 用 DOM 序 `querySelectorAll('[data-path]')` 切片、只高亮不导航，anchor 不可见回退单选；meta/ctrl toggle；普通单选+导航；右键未选中行先单选）；`TreeRow` 加 `data-path`；`FileTreeContext` 加多选字段；不做 `flattenVisible`；`DeleteConfirmDialog` 改多目标（`Promise.allSettled` 逐项 toast，复数文案）；选中数>1 显示"删除 N 项"；`handleFileDeleted` 收数组。批量拖动/重命名不在本轮。

### P4 阅读态 checkbox + 编辑态搜索替换

1. checkbox（优先）：`task-toggle.ts`（fence-aware 行映射 + frontmatter 偏移）；`MarkdownContent` 加 `input` override（去 `disabled`）+ wrapper `onChangeCapture` 事件委托取 DOM 序号（chat 变体不启用）；`useContentTaskToggle`（重读 → 替换 → save → setContent；dirty 注册表命中拒覆盖、重读不一致提示刷新、`saving` 禁用、失败回滚复用 `saveError`）。不新增 server 接口。
2. 搜索替换：`EditFindReplaceBar.tsx`（复用 FindBar 样式键位，字符串版 `findMatches`，第二 Input + 替换/全部替换，空替换加确认）；`Textarea` 加 ref（`setSelectionRange + scrollTop` 导航，slice 替换后重算）；独立 `editFindOpen` 状态，`Ctrl+F` 编辑态打开，`Header` 搜索按钮编辑态显示。

### 验证

- contracts 单测：move schema；core 单测：`moveEntry` 三例；server 契约：move 路由。
- app 单测：`tab-store`（closeOthers/closeAll/force/remapPaths）、`TabStrip` 右键、`FileTree` 单容器菜单（含节点/空白分支、readOnly 放行）、大纲提取跳转、多选 DOM 序 + 批量删除文案、task 行映射、替换计数。
- 手动：新建落点/改名 tab 跟随/denylist toast/拖动高亮；同文件强制新标签/浮窗展开回 Tab/Web 隐藏浮窗；大纲中英文锚点；多选预览项与路由回退；勾选落盘与草稿冲突；替换光标滚动与保存。

---

## 增补调研（2026-09-10续3）：split editor 左右分栏

> 状态：**调研完成，未实施**。首期只做 content 单分栏；完整 editor groups 另立项。

### 1. 现状（已验证代码）

- 单 active 模型：`tab-store.ts:23-26`（`ProjectTabs {tabs, activeTabId}`，一项目仅一个 active）；`TabContainer.tsx:13-21` 全量渲染各 Tab、非 active 用 `display:none` 隐藏（隐藏页保持挂载，编辑态不丢）。
- 单路由：`use-tab-route-sync.ts:12-33` 双 effect（路由→`openTab`；activeTab→`navigate replace`），`tab-route.ts:4-9,26-30` 下 activeTab 与 URL 一一对应。
- 内容实例模型：`TabPanel.tsx:65-122`（`ContentTabPanel` 以 `key={filePath}` remount `ContentBrowser`）；编辑/find/toc 全是 `ContentBrowser` 组件内 state；数据层 `useContentFile` 经 react-query `projectQueryKeys.content(projectId, filePath)` 共享读缓存，多实例同读一文件天然一致。
- 无分栏基元：`app/package.json` 无 resizable/split 库；全仓 `split` 无编辑器语义命中。现有"第二视图"只有 `floating-content-browser`（`feature-registry.ts:26` ELECTRON_ONLY，只读 `ContentView isEditing=false`，`FloatingContentBrowserContainer.tsx:67`，portal 挂 `document.body`）——Web 端无覆盖。
- 布局：`ProjectScope.tsx:69-76`（tabs 开时 `TabStrip + TabContainer` 纵排，`main flex-col`）；`tabs` 为 ALL_HOSTS（`feature-registry.ts:32`），分栏在 Web 端可用。

### 2. 分栏的五个硬冲突（已验证，审查修订）

1. `activeTabId` 单一：第二栏的"当前文件"无处表达；路由只能跟一栏（跟两栏则 URL 需编码双 pane，改动路由契约）。
2. `useContentEditor.ts:120-130` 的 `Ctrl+S` 与 `ContentView.tsx:133-159` 的两处 `Ctrl+F` 均挂 `window`，双窗同处对应态会双触发；且 `TabContainer` 以 `display:none` 挂起所有非 active tab，其隐藏实例 `findEnabled` 仍为 true，现状下 `Ctrl+F` 已会串台。需统一作用域化到聚焦窗（`rootRef.contains(document.activeElement)` 判据可一并修复隐藏 tab）。
3. `dirty-paths.ts:14-25`：按 `(projectId, filePath)` 存布尔，同文件双开两窗同时上报会 race（A 脏 B 干净→标记闪烁）。需按窗实例 id 的 Set（`setDirty(projectId, filePath, instanceId, dirty)` 幂等 add/remove）；注意 mount 时 `useContentEditor.ts:32-40` 也会 `setDirty(false)` 一次，朴素计数会变负，不可用。
4. `ContentView.tsx:104`：md 跨文件链接走 `useNavigate` 改主路由，右窗无法隔离导航。需 `ContentBrowser`/`ContentView` 加 `onNavigate?` 覆盖 prop，否则右窗点链接会把主窗路由切走。
5. `TabContainer` 保活策略：分栏后两窗同时可见，`display:none` 改并排 `flex-row`，订阅/内存翻倍但 query 缓存共享，可接受。右窗不可复用 `TabPanel`（`ContentTabPanel` 绑定 `closeTab` + 主窗 `navigate`），需新建 `SplitContentPane` 直接渲染 `ContentBrowser`。

### 3. 推荐方案（两档，首期只做 A）

**A. 轻量"右侧拆分打开"（仅 content，单分栏）：**

1. 状态独立小 store（`useSplitStore`，key `spherse:split` 按 project 存 `{filePath, ratio}`），不动 `tab-store` 持久化结构，避免迁移；`openSplit` 对"右窗已是该文件" no-op，不同文件直接替换。
2. `TabContainer` 有 split 时改 `flex-row`：左=现有 Tab 全量渲染（保留 `display:none`，无 tabs 时左窗+divider 隐藏、右栏全宽），右=新建 `SplitContentPane`（自算 `agents/activeSessions`，直接渲染 `ContentBrowser` 不传 `onSplit`），中间 divider 用 Pointer Events（`setPointerCapture`）+ 键盘左右箭头调 CSS var、`pointerup`/按键才 `setRatio`（不引库，与本系列"零新依赖"一致）。
3. 路由仍只跟主 `activeTabId`，`use-tab-route-sync` 不动；右窗内导航本地裁决：`ContentBrowser`/`ContentView` 加 `onNavigate?`（`handleLinkClick` 跨文件分支改用它，默认走原 `navigate`），右窗切 `filePath`，`onBack/onClose → closeSplit`。
4. 入口：`ContentBrowser Header` 加 split 按钮（`Header` 加 `onSplit?`，仅传入且非编辑态显示，主窗 `ContentTabPanel` 传 `() => openSplit(projectId, filePath)`）+ `FileTree` 仿 `onOpenInNewTab` 加 `onSplitFile` 管道到 `FileTreeContextMenu` 首段（仅文件）；门控 `tabs`；不做 `TabStrip` 右键。
5. 约束：仅 `content` 种；最多一分栏；**同文件允许共存**（主窗后导航到分栏文件不干预；双编辑 last-write-wins 由既有 fs-watch 冲突横幅 `useContentEditor.ts:142-147` 提示，不加硬禁）；右窗允许编辑（独立 `ContentBrowser` 实例），但先做下条前置修复。
6. i18n 新增（三语言同步）：`tabs.splitRight`、`file-tree.splitRight`（右窗关闭复用 Header 既有关闭按钮，不另加 key）。

**前置修复（与 split 同 PR，先实施）：**

- `ContentBrowser` 根 `div[data-content-browser]` 加 `rootRef`，传给 `useContentEditor` 与 `ContentView`；`Ctrl+S` + 两处 `Ctrl+F` 统一加 `rootRef.current.contains(document.activeElement)` 判据。
- dirty 注册表：`byProject` 改为按 path 存实例 id 数组，`setDirty(projectId, filePath, instanceId, dirty)` 幂等 add/remove；`isDirty` 为数组非空，`isDirtyUnder` 语义不变；`useContentEditor` 以 `useRef(crypto.randomUUID())` 作实例 id 上报，`filePath` 变化时换 id。

**B. 远期 editor groups（VSCode 模型，另立项）：** `byProject → {groups: {id, tabs, activeTabId}[], activeGroupId}`；`TabStrip` 分组渲染 + 跨组 DnD；路由跟焦点组；`spherse:tabs` 持久化迁移。A 的 split 状态可迁移为退化单 group。

**C. 否决：浮窗 dock 化。** floats 为 Electron-only 且只读无 editor，改造成本 ≈ B，且 Web 端仍无覆盖。

### 3. 实施顺序与验证

1. 前置修复（键盘作用域 + dirty 实例 Set）。
2. split store + 生命周期 + `TabContainer` 双栏 + divider + `SplitContentPane`（含 `onNavigate`/`onSplit` 接线）。
3. 两处入口 + i18n。

- app 单测：split open/replace/no-op/ratio 边界/持久化；双栏渲染；右窗 `onNavigate` 不触主路由；非聚焦窗 `Ctrl+S/F` 不触发；隐藏实例不响应；dirty 同 path 多实例归零才清。
- 手动：双 md 并排独立滚动；右窗编辑保存与 dirty toast；关闭项目清理 split（`project-lifecycle.ts` 加一行，与 dirty store 同款结构测试覆盖）；Web 端分栏可用。

---

## 增补调研（bugfix 2026-09-12）：打开文件默认不打开新标签页

> 状态：**调研完成，未实施**。待产品确认默认行为语义。

### 1. 原 design 理解错误点

原 §"增补调研（2026-09-10）：默认同标签页面打开"把"同文件去重"当成了"默认不打开新标签页"：

- 现状（已验证 `dev` 代码）：左键链路 `FileRow onClick`（`FileTreeNode.tsx:68`，经 P3 多选的 `selectFileWithModifiers`，普通左键仍走 `onSelectFile`）→ `UserFilePanel handleSelectFile`（`index.tsx:34-37`，纯 `navigate(.../content?path=)`）→ `use-tab-route-sync.ts:20` 裸 `openTab(projectId, spec)` → `tab-store.ts:105-106` 按 `identityOf`（`content:${filePath}`）去重。**同文件重复点仅激活（不开新），但不同文件必建新 tab**（落到 `:135-154`）。无"单复用槽 / preview tab"逻辑。
- 即：越点文件 tab 越多是当前必然行为，原 design"默认行为符合需求，不改"不成立。

### 2. 附带发现：P2 已实施，原 design 行号/现状描述过期

`ba9d342 2026-09-11` 已落地 P2 核心：`openTab opts.force` 跳过去重、`closeOthers/closeAll/remapPaths`、`user-file-panel/index.tsx:75-84` 的 `onOpenInNewTab`（`openTab force`）、`TabStrip` 右键。`readOnly 右键整体缺失` 也不再成立（只读下仍显示打开组 + 复制路径）。唯一未做：`open-file.ts` 的 `newTab` 扩展（右键走直接 `openTab force`）。

### 3. 已确认语义（2026-09-12 产品决策）

- **A 单复用槽**：左键始终复用当前 content tab（替换 filePath），新标签只走右键/中键/`force`。
- 范围限定：**仅文件如此；聊天会话依旧默认新标签打开**（session tab 不动）。
- 中键（`auxclick button===1`）走现有 `onOpenInNewTab`（等价右键新标签）。

### 4. bug2 文件重命名无响应（2026-09-13，现象仅安装版出现，根因假设待安装版验证）

- 现象：安装版点文件重命名后输入框从没出现（开发版正常），目录正常。
- 根因假设：菜单关闭时焦点被抢回触发行，`InlineNameInput` 的 `onBlur→onCancel` 瞬间自毁输入框。修法（机制防御，未证实根因）：`InlineNameInput` 挂载 200ms 内忽略 blur（`BLUR_GRACE_MS`，值待安装版实测校准），正常点空失焦取消不受影响。测试锁的是 grace 机制本身（宽限内不取消/宽限后取消），不是根因。
