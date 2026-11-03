import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useHostBridge } from "../context/host-bridge-context";
import { useAppStore } from "../stores/app-store";
import { useDetachedFloatStore } from "../stores/detached-float-store";
import { useFloatingChatStore } from "../features/floating-chat/store";
import { useFloatingContentBrowserStore } from "../features/floating-content-browser/store";
import { clampFloatBounds, registerNativeFloatFocus } from "../lib/float-window";
import type { FloatWindowClosedPayload } from "../lib/host-bridge";

function restoreOverlay(payload: FloatWindowClosedPayload): void {
  if (!useAppStore.getState().projects.has(payload.projectId)) return;
  const { position, size } = clampFloatBounds(payload.bounds, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
  if (payload.kind === "chat") {
    useFloatingChatStore.getState().setFloatingChat(payload.projectId, {
      sessionId: payload.itemKey,
      position,
      size,
      mode: "full",
    });
  } else {
    const store = useFloatingContentBrowserStore.getState();
    store.openFloat(payload.projectId, payload.itemKey);
    store.setPosition(payload.projectId, payload.itemKey, position);
    store.setSize(payload.projectId, payload.itemKey, size, position);
  }
}

export function FloatSyncBridge() {
  const navigate = useNavigate();
  const bridge = useHostBridge();

  useEffect(() => {
    const api = bridge.floatWindow;
    if (!api) return;
    registerNativeFloatFocus((kind, projectId, itemKey) => {
      void api.open({ kind, projectId, itemKey }).catch(() => undefined);
    });
    void api.list().then(
      (keys) => useDetachedFloatStore.getState().hydrate(keys),
      () => undefined,
    );
    const offClosed = api.onClosed((payload) => {
      useDetachedFloatStore.getState().remove(payload.key);
      if (payload.reason === "dock" || payload.reason === "crashed") {
        restoreOverlay(payload);
      }
    });
    const offNavigate = api.onNavigateMain(({ route }) => navigate(route));
    return () => {
      offClosed();
      offNavigate();
      registerNativeFloatFocus(null);
    };
  }, [bridge, navigate]);

  return null;
}
