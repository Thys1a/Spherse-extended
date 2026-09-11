# Plan：文件列表操作 + 标签页 + md 增强

对应 design：同目录 `design.md`（含产品决策与审查修订）。

决策：单容器 ContextMenu（`closest('[data-path]')` 分支）；dirty-path 注册表；move 走判别式联合；checkbox 用事件委托；shift 范围用 DOM 序；大纲 `tocOpen` 上提到 `index.tsx`；范围六项全做。

## 任务

### A1 标签 close all/other → verify: 单测
- `features/tabs/tab-store.ts`：加 `closeOthers(projectId, keepId)`、`closeAll(projectId)`（邻位激活 + 删空重建 home + `persist`）
- `features/tabs/TabStrip.tsx`：每 tab 包 `ContextMenu`（关闭/关闭其他/关闭全部），保留 `draggable`
- i18n 三语言：`tabs.closeOthers`、`tabs.closeAll`
- 测：`tab-store.test.ts`、`TabStrip.test.tsx`

### A2 文件右键新标签/浮窗 → verify: 单测 + 手动
- `tab-store.ts`：`openTab` 加 `opts?: { force?: boolean }` 跳过去重
- `file-tree-context` + `FileTreeNode` + `UserFilePanel`：加 `onOpenInNewTab` 管道（仿 `onFloatFile`，tabs 关时降级 navigate）
- `FileTreeContextMenu`：首段加"在新标签页中打开"；浮窗复用 `floatContent`；只读分支放行打开类菜单；门控 `tabs` / `floating-content-browser`
- i18n 三语言：`file-tree.openInNewTab`
- 测：force 去重 + 右键回调 + readOnly 分支；手动：同 path 多 tab 切换不抖动、Web 隐藏浮窗

### A3 md 大纲 → verify: 单测 + 手动
- 新增 `content-browser/useContentToc.ts`（`containerRef + docKey` → `[data-content-doc] h1[id],h2[id],h3[id]`）+ `TocPanel.tsx`（右侧 `aside w-56`，点击 `container.querySelector + CSS.escape + scrollIntoView`）
- `index.tsx`：`tocOpen` 上提（`Header` 开关 + 下传 `ContentView`）；gate = `isMarkdown && !isEditing && preview`
- `ContentView.tsx`：改 `flex-row`（保持 `mergeRefs`）；i18n：`content-browser.toc.title`
- 测：提取/跳转/编辑态隐藏；手动：中英文锚点

### A4 编辑态搜索替换 → verify: 单测 + 手动
- 新增 `content-browser/text-replace.ts`（纯函数：定位/单个/全部，复用 `findMatches`）
- 新增 `EditFindReplaceBar.tsx`（复用 FindBar 键位样式 + 第二 Input + 替换/全部替换；空替换确认）
- `ContentView.tsx`：`Textarea` 加 `ref`，`editFindOpen` 状态，`Ctrl+F` 编辑态打开，替换后 `useEffect` 恢复选区；`Header` 编辑态显示搜索按钮（原生 undo 丢失，本轮接受）
- 测：替换计数/全部/空替换

### B 阅读态 checkbox → verify: 单测 + 手动
- 新增 `content-browser/task-toggle.ts`（fence-aware 行映射 + frontmatter 偏移，纯函数）
- `MarkdownContent.tsx`：document 变体 `input` override 去 `disabled` + `data-md-task`；wrapper `onChangeCapture` 事件委托取 DOM 序号（不用渲染计数器）
- `ContentBrowser` 加 `useContentTaskToggle`：重读 → 比对 → 替换 → `saveContent` → `setContent/refreshKey`；dirty 注册表命中拒覆盖、重读不一致提示刷新、`saving` 禁用、失败回滚
- 测：行映射（引用/嵌套/有序/fence/frontmatter/`X`）；手动：落盘 `[x]`、草稿冲突

### C rename/move（跨层，拖动的地基）→ verify: 单测 + 契约测试 + 手动
- contracts：加 `contentMoveRequest { destination }`，`contentCreateRequest` 扩为判别式联合（`mkdir|touch|move`）
- `core/project-manager.ts`：加 `moveEntry(src, dest)`（`assertRead(src)+assertWrite(dest)`、源缺失/目标存在/移入自身或后代、src+dest 双锁固定顺序，照抄 `move-file.ts`）
- `server/routes/content.ts`：POST 处理 `move`；`app/lib/api.ts` 加 `moveContent`
- 新增 `lib/dirty-paths` 注册表（`useContentEditor` 上报，改名/移动前检查并 toast 中止）
- app：`InlineNameInput` 加 `initialValue`；`FileTreeContextMenu` 加"重命名"；`tab-store` 加 `remapPaths`（目录后代前缀重映射）+ `expandedPaths` 前缀重映射 + `invalidateProjectFileQueries(old+new)`
- 测：core `moveEntry` 三例、server move 契约（PM 写门面红线）、重命名提交/取消；手动：改名 tab 跟随、denylist 拒绝

### D 拖动移动 → verify: 组件测试 + 手动
- `FileTreeNode.tsx`：行 `draggable`，dragstart 带 path；目录 `onDragOver` 高亮 + `onDrop` 调 `moveEntry`；拦截拖入自身/后代/原父目录；落点仅目录
- 测：drop 调 move、非法落点拦截；手动：hover 高亮

### E shift 多选 → verify: 单测 + 手动
- 新增 `useFileTreeSelection`（`selected:Set + anchor`，仅文件）
- `FileRow onClick` 改 `selectWithModifiers`（shift 用 DOM 序 `querySelectorAll('[data-path]')` 切片、只高亮不导航，anchor 不可见回退单选；meta/ctrl toggle；普通单选+导航；右键未选中行先单选）
- `TreeRow` 加 `data-path`；`file-tree-context` 加多选字段（保留旧字段）
- 批量：`DeleteTarget`→数组，`DeleteConfirmDialog` 多目标（复数文案），`Promise.allSettled` 逐项 toast，`handleFileDeleted` 收数组；选中数>1 显示"删除 N 项"
- 测：范围/toggle/单选导航、批量删除文案；手动：预览项=最后一次点击、路由回退、Skill 树隔离

## 顺序

A1 → A2 → A3 → A4 → B → C → D → E（A 可并行；C 是 D 的前置；E 最后）

## 范围外

外部系统文件拖入（上传/导入）；scroll-spy；批量拖动/重命名；大纲浮窗入口；同文件多 tab 的路由区分。

## 验证收尾

- 每批次：对应 workspace `npm test` + `npm run lint`
- C 起：`npm run build` 后 `npm run typecheck`
- 收尾：`npm run verify` + doc-sync skill 自查
