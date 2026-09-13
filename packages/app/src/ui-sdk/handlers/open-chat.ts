import { isFeatureEnabled } from "../../lib/feature-registry";
import { useFloatingChatStore } from "../../features/floating-chat/store";
import { getDefaultFloatingState } from "../../features/floating-chat";
import type { ActionContext } from "../types";

export function openChat(
  ctx: ActionContext,
  sessionId: string,
  float: boolean | undefined,
  mode?: "full" | "pet",
): void {
  const floatingEnabled = isFeatureEnabled("floating-chat", ctx.hostKind);
  const tabsEnabled = isFeatureEnabled("tabs", ctx.hostKind);
  const currentFloating = useFloatingChatStore.getState().byProject[ctx.projectId]?.sessionId;
  if (float && floatingEnabled) {
    const nextMode = mode ?? "full";
    if (currentFloating !== sessionId) {
      useFloatingChatStore.getState().setFloatingChat(ctx.projectId, {
        ...getDefaultFloatingState(sessionId),
        mode: nextMode,
      });
    } else if (mode) {
      const current = useFloatingChatStore.getState().byProject[ctx.projectId];
      if (current && current.mode !== mode) {
        useFloatingChatStore.getState().setFloatingChat(ctx.projectId, { ...current, mode });
      }
    }
    return;
  }
  if (currentFloating !== sessionId || tabsEnabled) {
    ctx.navigate(`/project/${ctx.projectId}/chat/${sessionId}`);
  }
}
