import { isFeatureEnabled } from "./feature-registry";
import type { HostBridge } from "./host-bridge";

export function notifyUser(bridge: HostBridge, title: string, body: string): void {
  if (!isFeatureEnabled("system-notification", bridge.kind)) return;
  if (!bridge.capabilities.notification) return;
  if (typeof document !== "undefined" && document.hasFocus()) return;
  bridge.notify(title, body);
}
