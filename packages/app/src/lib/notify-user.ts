import { isFeatureEnabled } from "./feature-registry";
import type { HostBridge, NotificationOptions } from "./host-bridge";

export function notifyUser(
  bridge: HostBridge,
  title: string,
  body: string,
  opts?: NotificationOptions,
): void {
  if (!isFeatureEnabled("system-notification", bridge.kind)) return;
  if (!bridge.capabilities.notification) return;
  if (typeof document !== "undefined" && document.hasFocus()) return;
  try {
    bridge.notify(title, body, opts);
  } catch {
    void 0;
  }
}
