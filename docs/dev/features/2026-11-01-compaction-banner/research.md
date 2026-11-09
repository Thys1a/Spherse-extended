# 压缩结束小字横条（展开/收起）— 调研（2026-11-01）

- 目标：压缩完成后在聊天框内留一条持久小字横条展示压缩情况，可展开/收起；替代现在“看完即焚”的 toast。
- 结论：可行，约 0.5–1 天；关键约束是摘要正文不在 wire 上，推荐懒加载方案。

## 一、代码现状

- 现在只有 toast：`chat/index.tsx:217-226`，`applied`→success、`!applied`→info，看完即 `clearCompactResult()` 清掉。
- 状态层现成：`compactResult { applied, digestSource? }` 存于 session store（`entry-state.ts:32`、`entry-reducer.ts:128`），reducer/测试齐全。
- 数据盘点：`compact_result` wire 事件只有 `applied`/`digestSource`（`contracts/websocket.ts:290-295`）；`compaction_applied` 有 `anchorSeq`/`excludedSeqs`（可数“压掉了几条”）；**摘要正文 `digestContent` 只在 session log 里**，wire 上没有；token 释放量全链路无记录。
- 读路径现成：debug 侧 turn-context / session events log 可按需取摘要（`project-structure.md` 有登记）。

## 二、可行性

- 方案 A（wire 扩展 `digestContent` 截断 snippet）：reducer 直接渲染，一次到位；代价是每次压缩广播变大 + contracts/server projector/app 三层改动。不推荐。
- 方案 B（推荐）：横条只用现有字段（是否成功/来源/压掉条数）；展开时调现有 debug 读路径懒加载摘要正文。wire 零改动，多一次按需请求。
- 横条语义需先定：per-session 仅保留最近一次 + 手动关闭（`compactResult` 现会被清掉，改持久需动 `session-store.ts:193` 清理逻辑）；重连/切会话是否保留。

## 三、影响面

- app 为主：banner 组件（放 Composer 上方或消息流末尾，位置需定）+ `session-store.ts` 持久语义 + reducer + i18n + 组件测试。
- 选 A 才动 contracts（`compact_result` 加字段）与 server projector。
- 不碰 core 压缩机制本身。
