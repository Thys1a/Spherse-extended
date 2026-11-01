# plan：编辑模式下搜索移位

- 对应设计：同目录 `design.md`（审查通过，待实施）
- 本 plan 拥有 `textarea-reveal.ts` 的首次落地（先合者建；edit-toc 直接 import）

## 任务（按序，前者是后者的前置）

### 1. 新建 `packages/app/src/features/content-browser/textarea-reveal.ts`

实现 `design.md` §2 钉死的导出面：`measureMatchCenter` / `scheduleCenter(textarea, offset, frameRef)` / `cancelCenter(frameRef)`，三者不负责选区与聚焦。

- verify：`npm run lint --workspace=packages/app`、`npm run typecheck --workspace=packages/app` 通过。

### 2. 改 `EditFindReplaceBar.tsx:17-56`

删除 `scrollToOffset`；跳转 effect 改为 `setSelectionRange` → `focus({ preventScroll: true })` → `scheduleCenter`；新增 `frameRef`＋仅卸载 effect 调 `cancelCenter`（禁止在跳转 effect cleanup 里取消，机理见 design §1）。

- verify：现有 `EditFindReplaceBar.test.tsx` 全绿（行为未变）。

### 3. 追加组件测试

跳转后选区等于目标 match、`focus` 以 `{ preventScroll: true }` 调用、替换后 refocus 路径选区正确、测量失败分支不写 `scrollTop`、不断言像素值。

- verify：`npm test --workspace=packages/app -- src/features/content-browser/EditFindReplaceBar.test.tsx`。

### 4. 新增 `packages/desktop/e2e/content-edit-find-scroll.spec.ts`

冒烟：上下按钮跳转（禁 Enter）、选区正确、`scrollTop ∈ [0, scrollHeight-clientHeight]`、文本未被改动、改窗口高度后重跳。

- verify：`npm run test:e2e --workspace=packages/desktop -- e2e/content-edit-find-scroll.spec.ts`。

### 5. 人工验证

长文档上/中/下三处跳转，目标行居中无半行遮挡；替换一次后选中仍在同一序号匹配附近。

- verify：按 design §人工验证逐项打勾。

### 6. 收尾门

- verify：`npm run lint --workspace=packages/app`、`npm run typecheck --workspace=packages/app`、相关单测全绿；合并前 `npm run verify:e2e`。
- 验收：design §验收标准逐项通过。
