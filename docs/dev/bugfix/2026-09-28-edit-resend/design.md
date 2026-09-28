# 消息编辑重发（edit-resend）重建方案

- 日期：2026-09-28
- 状态：方案（未实施）
- 类型：功能回归恢复（`2b507c0` chat 前端重构 PR3 误删，未重建）
- 关联：`docs/dev/backlog.md:79`（完成后删除该条）

## 一、现象与根因（已调查）

用户消息的"编辑并重新发送"入口消失。原链路（`26f361f`）：`MessageItem` 行内编辑态 → `streaming-store.editAndResend`（撤回末轮 + 用编辑后文本重发）。`2b507c0` 删除 `MessageItem.tsx` / `streaming-store.ts` / `retry-plan.ts`，新模型（Entry + MessageGroup + session-store）下无等价物：`UserBubble` 只有复制/撤回、`Composer` 无编辑态、全仓无 `editAndResend`。

后端能力完好，无需动 core / server / contracts / i18n：
- 撤回链：`withdrawLastTurn`（含连续撤回修复）+ `turn/withdrawn` ack
- 重发链：`planRetry` 的 resend 语义 + `sendMessage`（clientId 结算）
- 文案：`chat.editTooltip` / `chat.editConfirm` / `chat.editCancel` 三语仍在，直接复用，不新增 key

## 二、形态决策：行内气泡编辑，不做 Composer 编辑态

- 与旧实现同 UX：用户气泡铅笔按钮 → 行内 textarea → 确认重发 / 取消
- backlog:79 的"Composer 编辑态"实为误记——旧 textarea 与 `EDIT_MIN_HEIGHT/MAX_HEIGHT`（`2*20+16` / `10*20+16`，自动撑高）都在气泡侧；Composer 方案要动 draft 键、placeholder、发送行三处，且与其现有职责冲突
- 作用域 v1：仅末个可撤回轮（与撤回按钮同门 `user.id === withdrawableUserId`），与旧实现一致；更早轮以后再说

## 三、改动清单

1. `packages/app/src/features/chat/model/entry-state.ts`：`ChatEntryState` 加 `pendingEditResend: { content: string; image?: SendableImage } | null`，默认 null（与 `pendingWithdraw` 并列）
2. `packages/app/src/features/chat/model/entry-reducer.ts`：`applyError` 两处清 `pendingEditResend`（撤回失败即丢意图）；`applyWithdraw` 不碰它（留给 drain 消费）
3. `packages/app/src/features/chat/model/persisted-entries.ts`：`applyPersistedEvents` 入口无条件清 `pendingEditResend`——任何重放都作废 in-flight 意图（含重连补放的 `turn/withdrawn`：只对齐状态，不补发）。意图是纯 live 态，不过 reload，此举无副作用
4. `packages/app/src/features/chat/runtime/outbound-actions.ts`：新增 `editAndResend(sessionId, text, image?)`——guard（会话存在、非 streaming、link open、有可撤回 user、非空、`pendingWithdraw` 与 `pendingEditResend` 均为 falsy）→ 置 `pendingWithdraw` + `pendingEditResend` → `link.send({ type: "withdraw" })`；同样 guard 下二次调用直接返回（防连点）。另在既有 `sendMessage` 内清 `pendingEditResend`：任何新发送都作废编辑意图（否则用户在等待 ack 时又发一条，随后的 drain 会补发旧意图，产生两条 turn）
5. `packages/app/src/features/chat/runtime/session-store.ts`：`flushBatches` 内 drain——仅当 batch 含 live `turn_withdrawn` 且该 session 意图仍在时，先清意图再调 `outbound.sendMessage`。实现方式：在 `set()` 的 updater 内只把 `{sessionId, intent}` 旁路收集到局部数组，`set()` 返回**之后**再遍历执行发送——副作用不得放在状态更新器内（纯度/可测性；与 StrictMode 无关）。`outbound` 定义在 `flushBatches` 之后，闭包运行时引用即可
6. `packages/app/src/features/chat/hooks/useChatSession.ts`：暴露 `editAndResend`
7. `packages/app/src/features/chat/MessageList.tsx`：新增 `onEditUserMessage(entry, text)`，只传给可撤回气泡
8. `packages/app/src/features/chat/UserBubble.tsx`：铅笔按钮 + 编辑态 textarea（沿用旧 auto-resize 逻辑与 min/max）+ 确认/取消；确认时若 draft 与原文 trim 后一致则直接退出编辑态（不撤回不重发）。附件只带图片：复用 `planRetry` 的 `toSendable` 逻辑，但先给它加 `attachment.type === "image"` 前提（file 附件不随行；`sendMessage` 本就只收单图，`Composer` 提交层亦拒收 file，与现有能力一致）并导出，供 `index.tsx` 接线用
9. `packages/app/src/features/chat/index.tsx`：`onEditUserMessage={(entry, text) => editAndResend(text, toSendable(entry))}`

## 四、测试

- `outbound-actions.test.ts`：置意图 + 发 withdraw；streaming / 断连 / 无 user / 空文本四 guard；二次调用 no-op
- `session-store.test.ts`：含 `turn_withdrawn` 的 batch 触发重发并清意图；`error` batch 清意图不重发
- `entry-reducer.test.ts`：`applyError` 清意图、`applyWithdraw` 保留意图
- `UserBubble.test.tsx`：按钮 → textarea → 确认调 onEdit(draft) / 取消还原；空 draft 确认无动作；同文本确认直接退出不调 onEdit
- `MessageList.test.tsx`：onEdit 只给可撤回气泡
- `outbound-actions.test.ts` 追加：`pendingWithdraw` 已 true 时拒绝；`sendMessage` 清意图
- `session-store.test.ts` 追加：replay 到 `turn/withdrawn` 不补发（意图已在入口清掉）
- 验证：`npm test --workspace=packages/app` 相关文件 + typecheck；E2E 不要求，手动点一遍即可

## 五、影响面与收尾

- 全是既有文件内改，不新增文件；无新 i18n key（`check:i18n` 必过）；无官方文档变更面
- 完成即删 `docs/dev/backlog.md:79`
- 边界：`sendFailed` 的 user 无撤回资格，连带无编辑资格（与撤回按钮同门，一致）；重发走普通 `sendMessage`，断连时按现有逻辑落成 sendFailed 条目，不另处理；等待 ack 期间的新发送作废编辑意图（见第 4 条），不产生双 turn
