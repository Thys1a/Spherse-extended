# 压缩结束小字横条 — 方案设计

- 日期：2026-11-01
- 前置：`research.md`（同目录；推荐方案 B 懒加载）
- 范围：手动＋自动两路统一横条；toast 保留（手动路径），横条为详情通道（接受双通道）

## 一、语义

- 压缩完成后在消息流末尾、Composer 上方（`chat/index.tsx:313-317` 之间，QuickReplyBar 上方）留一条小字横条：结果（成功/无需）＋压掉条数（有的话）＋展开/关闭。
- 手动（`compact_result`）与自动（`compaction_applied`，目前 UI 完全无感知——`entry-reducer.ts:122` 只推进游标）**两路都进横条**，否则自动压缩仍是黑盒。
- 展开内容：摘要正文＋压掉条数，按需懒加载（见 §二），不常驻内存。
- 生命周期：per-session 仅保留最近一次；手动关闭（×）；新压缩到达替换旧横条；切会话/重连不恢复（live-only）；从未压缩过不渲染（非空横条占位）。
- toast 保留：手动路径 toast 与横条并存（双通道接受）；toast effect 不再调 `clearCompactResult`，仅 × 清空。自动压缩无 toast、仅横条（不对称，见上）。`!applied`（无需压缩）同样留横条一句话，可直接关闭。

## 二、改动

- `entry-reducer.ts`：`compaction_applied` 分支除推进游标外，另存 `{ applied: true, anchorSeq, excludedCount: excludedSeqs.length, digestSource? }` 进 `compactResult`（类型在 `entry-state.ts:21` 扩展可选字段，旧 `compact_result` 路径不变）。
- `session-store.ts`：`clearCompactResult` 保留供手动关闭调用；`index.tsx:217-226` 的 toast effect 删除，改为渲染横条（`compactResult` 非空即显示）。
- 新组件 `packages/app/src/features/chat/CompactionBanner.tsx`（`+ CompactionBanner.test.tsx`；与 `MessageList`/`Composer` 同级，收 `compactResult` + `sessionId` + `onDismiss`）：首行小字＋展开按钮；首次展开时调 `api.getSessionEvents(agentId, sessionId)` 取最近一条 `compaction/applied` 的 `digestContent`（已有 client 方法 `api.ts:753`，无需新路由；失败则只显示条数行）。
- i18n：`chat.compactBannerTitle`（带 `{count}` 参数）、`chat.compactBannerExpand`、`chat.compactBannerCollapse`、`chat.compactBannerClose`、`chat.compactBannerDigestFailed`，三语同步。
- 不扩展 wire（`compact_result` / `compaction_applied` 字段不动，contracts/server 零改动）。

## 三、测试

- reducer：`compaction_applied` 写横条态（含条数）；`compact_result` 两态；新压缩替换旧横条。
- 组件：横条渲染（成功/无需两种文案；初始空态不渲染）、展开触发懒加载（mock `getSessionEvents`）、加载失败降级、手动关闭清 store；toast effect 不再清空的回归（手动压缩后横条仍在）。
- store：`clearCompactResult` 只清本 session。

## 四、不做的事

- token 释放量展示（全链路无数据源）。
- 历史压缩横条列表（仅最近一次）。
- wire 扩展摘要正文（方案 A，否决）。
- core 压缩机制本身（零改动）。
