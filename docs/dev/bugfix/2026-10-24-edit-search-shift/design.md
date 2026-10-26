# 编辑模式下搜索移位

- 日期：2026-10-24
- 状态：审查通过，待实施
- 排期：v1.0.3（bug）
- 范围：`EditFindReplaceBar`（`packages/app/src/features/content-browser/EditFindReplaceBar.tsx`）＋新建一个 desktop E2E spec
- 证据：实现落点、浏览器定位手段、测试约束已由三路只读子代理核对，并对照源码复核；审查报告见本次会话（C1/C2/I1–I3/M4–M8 已收敛）
- 附带调研：`research.md`（编辑模式大纲跳转现状、替换后重定位次要项）

## 目标

编辑模式下按上一个/下一个跳转时，目标匹配行垂直居中，消除目前偏上或偏下一段的系统性偏移。

## 非目标

- 不改 `findMatches` 匹配语义；
- 不改 `replaceOneAt` / `replaceAllOccurrences` 替换语义；
- 不改替换后“回到同序号”的现有行为；
- 不改阅读模式 `scrollRangeIntoView`；
- 不新增 API、schema、i18n 文案；居中函数落入与 edit-toc 共用的 `packages/app/src/features/content-browser/textarea-reveal.ts`（见 `docs/dev/features/2026-10-27-edit-toc/design.md` §三.3，先合者建模块）。

## 已核对成因

`scrollToOffset`（`EditFindReplaceBar.tsx:17-21`）存在三个可直接删除的误差源：

1. 只按 `\n` 计算逻辑行，无视编辑区默认软换行；
2. 行号从 1 开始，但公式直接使用 `line * lineHeight`，恒多偏大约一行；
3. `getComputedStyle(...).lineHeight` 取不到计算值时回退 20，而实际为 `font-mono` + `!text-base` + `leading-relaxed`。

同时，跳转 effect 先调用无参数 `focus()`，浏览器自主滚动可能与手动 `scrollTop` 竞争（`EditFindReplaceBar.tsx:48-56`）。

## 方案

只替换滚动定位实现，不改跳转状态与调用点，仅调整 focus 与滚动时序。

### 1. 选区、焦点与帧生命周期

修改 `EditFindReplaceBar.tsx:48-56`：

1. 先 `setSelectionRange(start, end)`；
2. 再 `textarea.focus({ preventScroll: true })`；
3. 下一帧 `requestAnimationFrame` 执行居中计算；
4. `goTo` 和替换后 `refocusIndex` 的调用点不变。

约束（审查 C1）：本 effect 内已 `setPendingSelection(null)`，会因依赖变化重跑 effect——因此**禁止在该 effect 的 cleanup 里取消帧**，否则新排定的帧会被立即取消、居中永不执行。帧的并发与卸载按以下规则：

- 调用方持有 `frameRef: useRef<number | null>` 并传给 `scheduleCenter(textarea, start, frameRef)`，其内部先 `cancelAnimationFrame` 旧帧再排新帧，保证连续跳转时最新落点获胜；
- 调用方另起一个仅卸载时运行的 effect 调 `cancelCenter(frameRef)`；
- `useLocateMessage.ts:67,82` 的 cleanup-cancel 之所以安全，是因为它只写 ref 不改自身依赖，本处不可照搬。

### 2. 用 mirror 测量目标行位置

新增三个函数（落点：`packages/app/src/features/content-browser/textarea-reveal.ts`，与 edit-toc 共用，先合者建模块），导出面钉死：

```ts
export function measureMatchCenter(textarea: HTMLTextAreaElement, offset: number): number | null;
export function scheduleCenter(textarea: HTMLTextAreaElement, offset: number, frameRef: { current: number | null }): void;
export function cancelCenter(frameRef: { current: number | null }): void;
```

三者不负责 `setSelectionRange`/`focus`，由调用方按 §1 顺序执行。

测量规则：

1. `offset` 钳制到 `[0, textarea.value.length]`；
2. 前缀长度超过 20 万字符时直接返回 `null`（审查 M4：单次跳转 O(prefix)＋两次强制布局，大文件降级为原生选区可见行为）；
3. 创建隐藏 mirror `div`，文本用 `createTextNode`，不使用 `innerHTML`；
4. 填入 `value.slice(0, offset)`，末尾加一个内容为 `\u200b` 的 marker（与前缀并入同一文本节点，避免独立 span 在行尾占满时多换一行）；
5. mirror 宽度取 textarea 内容宽度：
   - `contentWidth = textarea.clientWidth - paddingLeft - paddingRight`（`clientWidth` 含 padding、不含 border/scrollbar）；
   - mirror 使用 `box-sizing: content-box`、`padding: 0`、`border: 0`；
6. 排版属性**一律取自 `getComputedStyle(textarea)`**（审查 M6：禁止硬编码，漏掉 UA 默认的 `white-space: pre-wrap` / `overflow-wrap: break-word` 即回归本 bug）：
   - `width`（按上面计算后的内容宽度）；
   - `font-family/size/weight/style`、`line-height`、`letter-spacing`、`word-spacing`；
   - `text-transform`、`text-indent`、`tab-size`、`direction`、`writing-mode`；
   - `white-space`、`overflow-wrap`、`word-break`；
7. mirror 定位为脱离文档流但参与排版：
   - `position: fixed`、`top: 0`、`left: 0`；
   - `visibility: hidden`、`pointer-events: none`；
   - `overflow: hidden`；
8. 中心取 `marker.offsetTop + lineHeight / 2`（审查 I2：inline 元素的 `offsetHeight` 是字体盒高度、不含半行距，不能用 `offsetTop + offsetHeight / 2`）：
   - `lineHeight = parseFloat(getComputedStyle(textarea).lineHeight)`；
   - 取到 `normal`/`NaN` 时回退 `fontSize * 1.2`；
9. `try/finally` 删除 mirror；
10. 以下情况返回 `null`，不修改 `scrollTop`，保留浏览器默认选区可见行为（审查 M5：jsdom/字体未就绪时镜像不抛错、返回 `0`，此时写 `scrollTop = 0` 比现状更差）：
    - 抛错；
    - `!Number.isFinite(center)`；
    - `offset > 0 && center <= 0`。

### 3. 居中赋值

测量成功后：

```ts
const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
textarea.scrollTop = Math.min(
  Math.max(0, center - textarea.clientHeight / 2),
  maxScroll
);
```

这样可同时处理：

- 软换行；
- `line-height: normal`；
- 内边距和边框；
- 短文档上下钳制。

### 4. 风险与回退

- 字体懒加载/缩放导致镜像瞬时失配：测量在跳转后下一帧强制布局执行，`try/finally`＋第 2 节第 10 条回退保证不比现状差；
- 垂直居中相对内容原点，未计入顶部 padding（`p-4` 约 16px 级别偏差的一半），在人工验证容差内，不单独处理；
- 跳转后焦点进入 textarea（现存行为，本次保留）：查找框内 `Enter` 触发一次跳转后，后续 `Enter` 落在 textarea 会插入换行并弄脏文档——属现存交互问题，不在本次修，已记 backlog，E2E 禁止用 `Enter` 连续跳转。

## 测试

### 组件测试

追加到 `packages/app/src/features/content-browser/EditFindReplaceBar.test.tsx`：

- 跳转后 `selectionStart/selectionEnd` 等于目标 match；
- `focus` 以 `{ preventScroll: true }` 调用；
- 替换后 `refocusIndex` 路径的选区回到同一序号 match；
- 测量失败分支不写 `scrollTop`（镜像返回 `null` 时保留原生行为）；
- 不断言具体 `scrollTop` 像素值；
- 不 mock 布局几何去“证明”居中正确。

命令：

```bash
npm test --workspace=packages/app -- src/features/content-browser/EditFindReplaceBar.test.tsx
```

### 真机 E2E（冒烟，审查 I1/C2）

`testing.md:61,65` 明确布局/视觉不写自动化断言，且 textarea 内部字形位置没有可读 API——E2E 只做冒烟，居中正确性归人工验证。新增 `packages/desktop/e2e/content-edit-find-scroll.spec.ts`：

1. 用 `createFileTreeProject` 生成包含 120 行以上的 `long.md`；
2. 目标词分布在文档上、中、下三处，其中一处位于可软换行的长行；
3. 点击头部编辑按钮进入编辑模式，按 Ctrl/Cmd+F 或点击查找图标打开编辑态查找条，输入目标词；
4. 用上下按钮（`aria-label` 取 `content-browser.find.next/previous`）连续跳转——**禁止用 `Enter` 连续跳转**（焦点已进 textarea，`Enter` 会插入换行弄脏文档，见 §4）；
5. 每次跳转后断言：
   - `selectionStart/selectionEnd` 等于目标 match；
   - `scrollTop` 落在 `[0, scrollHeight - clientHeight]` 内；
   - textarea 内容未被改动；
6. 修改窗口高度后重复一次跳转，覆盖 `clientHeight` 相关回归。

命令：

```bash
npm run test:e2e --workspace=packages/desktop -- e2e/content-edit-find-scroll.spec.ts
```

### 人工验证

长文档中分别跳转上、中、下三个目标，确认目标行居中且无半行遮挡；替换一次后确认选中仍在同一序号匹配附近。

## 验收标准

- 目标匹配行居中，不再系统性偏上或偏下；
- 软换行、默认行高、内边距变化不再引起固定方向偏移；
- 替换、计数、上一个/下一个行为不变；
- 组件测试、新增 E2E 通过，人工验证目标行居中无半行遮挡；
- `npm run lint --workspace=packages/app` 与 `npm run typecheck --workspace=packages/app` 通过；
- 合并前运行 `npm run verify:e2e`。

