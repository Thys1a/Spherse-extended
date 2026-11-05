import type { FloatWindowKind, HostBridge } from "./host-bridge";
import { useDetachedFloatStore } from "../stores/detached-float-store";

export function floatKey(kind: FloatWindowKind, projectId: string, itemKey: string): string {
  return `${kind}:${projectId}:${itemKey}`;
}

export function isFloatDetached(kind: FloatWindowKind, projectId: string, itemKey: string): boolean {
  return useDetachedFloatStore.getState().keys.has(floatKey(kind, projectId, itemKey));
}

type NativeFloatFocus = (kind: FloatWindowKind, projectId: string, itemKey: string) => void;

let nativeFloatFocus: NativeFloatFocus | null = null;

export function registerNativeFloatFocus(fn: NativeFloatFocus | null): void {
  nativeFloatFocus = fn;
}

export function focusNativeFloat(kind: FloatWindowKind, projectId: string, itemKey: string): boolean {
  if (!nativeFloatFocus) return false;
  nativeFloatFocus(kind, projectId, itemKey);
  return true;
}

export async function popOutFloat(
  bridge: HostBridge,
  kind: FloatWindowKind,
  projectId: string,
  itemKey: string,
  removeOverlay: () => void,
): Promise<boolean> {
  const api = bridge.floatWindow;
  if (!api) return false;
  const key = floatKey(kind, projectId, itemKey);
  useDetachedFloatStore.getState().add(key);
  let opened = false;
  try {
    opened = (await api.open({ kind, projectId, itemKey })) !== null;
  } catch {
    opened = false;
  }
  if (!opened) {
    useDetachedFloatStore.getState().remove(key);
    return false;
  }
  removeOverlay();
  return true;
}

export interface ClampedFloatBounds {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

const MIN_FLOAT_SIZE = 200;

export function clampFloatBounds(
  bounds: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
): ClampedFloatBounds {
  const width = Math.min(Math.max(bounds.width, MIN_FLOAT_SIZE), viewport.width);
  const height = Math.min(Math.max(bounds.height, MIN_FLOAT_SIZE), viewport.height);
  const x = Math.min(Math.max(bounds.x, 0), Math.max(viewport.width - width, 0));
  const y = Math.min(Math.max(bounds.y, 0), Math.max(viewport.height - height, 0));
  return { position: { x, y }, size: { width, height } };
}
