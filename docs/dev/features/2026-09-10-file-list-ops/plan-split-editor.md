# Plan：split editor（A 档轻量单分栏）

对应调研：同目录 `design.md`「增补调研（2026-09-10续3）」（已按审查修订）。

决策：先 A 未来 B；前置修复与 split 同 PR；右窗允许编辑；入口为 ContentBrowser Header + 文件树右键（不做 TabStrip 右键）；首次 50/50，divider 宽度持久化；同文件允许共存（主窗后导航到分栏文件不干预，双编辑冲突由既有 fs-watch 横幅提示）。

## 目标与约束

- 右侧拆分打开单个 content 文件，左右独立滚动/编辑/保存。
- 仅 `content` kind，最多一分栏；`openSplit` 对"右窗已是该文件" no-op，不同文件直接替换。
- 路由只跟主窗 activeTab；门控 `tabs`，Web/Electron 通用。

## 任务

### 1 前置修复 → verify: 单测

- `ContentBrowser` 根 `div[data-content-browser]` 加 `rootRef`，传给 `useContentEditor` 与 `ContentView`。
- `useContentEditor.ts`：`Ctrl+S` 仅在 `rootRef.current.contains(document.activeElement)` 时 `save()`（顺带修复隐藏 tab 串台）。
- `ContentView.tsx`：两处 `Ctrl+F`（阅读/编辑）加同一判据。
- `lib/dirty-paths.ts`：`byProject` 改为按 path 存实例 id 数组，`setDirty(projectId, filePath, instanceId, dirty)` 幂等 add/remove；`isDirty` 为数组非空，`isDirtyUnder` 语义不变。
- `useContentEditor`：`useRef(crypto.randomUUID())` 作实例 id，mount/cleanup 上报带 id，`filePath` 变化时换 id（防同 mount 切文件串 dirty）；同步更新 `dirty-paths` 单测。

### 2 split store → verify: 单测

- 新建 `features/tabs/split-store.ts`：`byProject: Record<projectId, { filePath; ratio } | undefined>`，`openSplit/setFile/closeSplit/setRatio/clearProject`，约 40 行。
- 持久化 key `spherse:split`，`ratio` 夹 `[0.2, 0.8]`，默认 `0.5`。
- `project-lifecycle.ts` 加 `clearProject` 一行。

### 3 双栏渲染 → verify: 单测 + 手动

- 新建 `SplitContentPane.tsx`：自算 `agents/activeSessions`，渲染 `ContentBrowser`（不传 `onSplit`）；`onBack/onClose → closeSplit`；`onNavigate → setFile`；`onStartSession` 透传主窗 chat。
- `ContentBrowserProps` 加 `onSplit?`、`onNavigate?`；`ContentView` 加 `onNavigate?`（`handleLinkClick` 跨文件分支改用它，默认走原 `navigate`）；`Header` 加 `onSplit?`（仅传入且非编辑态显示）。
- `TabContainer`：有 split 时改 `flex-row`，左=既有 tabs（保留 `display:none`），中=divider，右=`SplitContentPane`；无 tabs 但有 split 时左窗+divider 隐藏、右栏全宽。
- divider：Pointer Events（`setPointerCapture`）+ 键盘（左右箭头 ±0.05，`role=separator` + `aria-valuenow`），`pointerup`/按键才 `setRatio`（拖拽中只写 CSS var，不写 store/盘），不引新库。
- `use-tab-route-sync` 不动。

### 4 入口 + i18n → verify: 手动

- 主窗 `ContentTabPanel` 传 `onSplit={() => openSplit(projectId, filePath)}`（`tabs` 门控）。
- `FileTree`：仿 `onOpenInNewTab` 加 `onSplitFile` 管道到 `FileTreeContextMenu` 首段（仅文件，`tabs` 门控）。
- i18n 三语言：`tabs.splitRight`、`file-tree.splitRight`（右窗关闭复用 Header 既有关闭按钮，不另加 key）。

## 验证

- 单测：split open/replace/no-op/ratio 边界/持久化；双栏渲染；右窗 `onNavigate` 不触主路由；非聚焦窗 `Ctrl+S/F` 不触发；隐藏实例不响应；dirty 同 path 多实例归零才清。
- 手动：双 md 并排滚动/编辑/保存互不干扰；右窗点相对链接在右窗内切换；divider 宽度刷新后复用；关闭项目清理 split；Web 端可用。

## 已确认行为（review 结论，不修）

- 右窗选词建会话切主窗到 chat（与主窗同逻辑，预期行为）。
- 焦点落在两窗之外时 `Ctrl+S/F` 无响应（隐藏 tab 不再串台的代价）。
- 右窗内导航切文件时若右窗正脏，直接丢草稿（`onNavigate` 绕过 `requestLeave` 确认）。
- RTL 下 divider 拖拽方向未适配（无 RTL locale，暂不处理）；触屏靠 pointer 事件可用。

## 范围外

- TabStrip 右键入口；chat/browser 分栏；多分栏；同文件双编辑硬禁（last-write-wins + fs-watch 冲突横幅兜底）；B 档 editor groups（groups 数组 + activeGroupId + 跨组 DnD + 持久化迁移，另立项）。
