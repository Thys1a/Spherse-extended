import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDetachedFloatStore } from "../stores/detached-float-store";
import {
  clampFloatBounds,
  floatKey,
  focusNativeFloat,
  isFloatDetached,
  popOutFloat,
  registerNativeFloatFocus,
} from "./float-window";
import { createMockHostBridge } from "../test/host-bridge";

beforeEach(() => {
  useDetachedFloatStore.setState({ keys: new Set() });
  registerNativeFloatFocus(null);
});

describe("floatKey", () => {
  it("builds a stable key", () => {
    expect(floatKey("chat", "p1", "s1")).toBe("chat:p1:s1");
    expect(floatKey("content", "p1", "a/b.md")).toBe("content:p1:a/b.md");
  });
});

describe("detached registry", () => {
  it("reports detached items", () => {
    expect(isFloatDetached("chat", "p1", "s1")).toBe(false);
    useDetachedFloatStore.getState().add(floatKey("chat", "p1", "s1"));
    expect(isFloatDetached("chat", "p1", "s1")).toBe(true);
  });

  it("focuses through the registered callback", () => {
    const focus = vi.fn();
    expect(focusNativeFloat("chat", "p1", "s1")).toBe(false);
    registerNativeFloatFocus(focus);
    expect(focusNativeFloat("chat", "p1", "s1")).toBe(true);
    expect(focus).toHaveBeenCalledWith("chat", "p1", "s1");
  });
});

describe("popOutFloat", () => {
  it("opens the native window first and removes the overlay only on success", async () => {
    const bridge = createMockHostBridge({
      floatWindow: {
        open: vi.fn(async () => ({ ok: true as const })),
        closeSelf: vi.fn(async () => true),
        navigateMain: vi.fn(async () => true),
        list: vi.fn(async () => []),
        onClosed: vi.fn(() => () => {}),
        onNavigateMain: vi.fn(() => () => {}),
      },
    });
    const removeOverlay = vi.fn();

    await expect(popOutFloat(bridge, "chat", "p1", "s1", removeOverlay)).resolves.toBe(true);
    expect(bridge.floatWindow?.open).toHaveBeenCalledWith({ kind: "chat", projectId: "p1", itemKey: "s1" });
    expect(removeOverlay).toHaveBeenCalledTimes(1);
    expect(isFloatDetached("chat", "p1", "s1")).toBe(true);
  });

  it("keeps the overlay and drops the detached key when open fails", async () => {
    const bridge = createMockHostBridge({
      floatWindow: {
        open: vi.fn(async () => null),
        closeSelf: vi.fn(async () => true),
        navigateMain: vi.fn(async () => true),
        list: vi.fn(async () => []),
        onClosed: vi.fn(() => () => {}),
        onNavigateMain: vi.fn(() => () => {}),
      },
    });
    const removeOverlay = vi.fn();

    await expect(popOutFloat(bridge, "chat", "p1", "s1", removeOverlay)).resolves.toBe(false);
    expect(removeOverlay).not.toHaveBeenCalled();
    expect(isFloatDetached("chat", "p1", "s1")).toBe(false);
  });

  it("returns false without a floatWindow capability", async () => {
    const bridge = createMockHostBridge();
    await expect(popOutFloat(bridge, "chat", "p1", "s1", vi.fn())).resolves.toBe(false);
  });
});

describe("clampFloatBounds", () => {
  it("clamps oversized windows into the viewport", () => {
    expect(
      clampFloatBounds({ x: 5000, y: -50, width: 2000, height: 2000 }, { width: 800, height: 600 }),
    ).toEqual({
      position: { x: 0, y: 0 },
      size: { width: 800, height: 600 },
    });
  });

  it("keeps in-viewport bounds untouched", () => {
    expect(
      clampFloatBounds({ x: 10, y: 20, width: 420, height: 600 }, { width: 1920, height: 1080 }),
    ).toEqual({
      position: { x: 10, y: 20 },
      size: { width: 420, height: 600 },
    });
  });
});
