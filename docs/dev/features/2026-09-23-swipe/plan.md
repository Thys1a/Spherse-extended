# Implementation Plan: R6.2 swipe（单独立项，方向锁定）

- 日期：2026-09-23
- Design：`docs/dev/features/2026-09-19-game-engine-phase2/design.md` §二决策 9（一期 `2026-09-17-game-engine/design.md` 决策 9 沿用）
- 范围：本期只定接口方向，实现（reducer + 持久化 + WS + UI）另行排期。
- 模式：方向评审通过后，按依赖顺序执行，每 Task 独立可验证；完成即在标题行标注 `[x]`

## 锁定的接口方向（已拍板，不展开实现）

- 分支带走 active 版；切换记新事件（append-only 相容）。
- 与 backlog 会话分支项（`backlog.md` 功能增强“会话分支：子 log 本地 seq 从 0 + fold 虚拟 seq 映射”）的关系：立项实现前必须先定义（合并/复用/并行三选一），否则两套分支语义冲突。
- 改动面：reducer 分支状态 + 持久化（分支带走 active 版）+ WS 事件（contracts + `chat-wire-projector`）+ swipe UI（`MessageItem`/`MessageList` 层）。

## 开放问题（实现排期前关闭）

- [ ] 与 backlog 会话分支项的关系定义（合并 / 复用其虚拟 seq 映射 / 并行两套）。
- [ ] 分支切换事件名与 payload（对标 `turn/retried` / `turn/withdrawn` 命名）。
- [ ] swipe 手势与现有行内操作（withdraw/edit/delete，R6.1/R6.3 落地）的交互与互斥。
- [ ] 未加载历史（`hasMore`）下的分支可见性。

## 非目标

- 本期无实现代码；E5 整窗替换不依赖本项。

