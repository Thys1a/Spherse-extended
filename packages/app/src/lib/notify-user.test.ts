import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostBridge } from "./host-bridge";
import { notifyUser } from "./notify-user";

function createBridge(overrides: Partial<HostBridge> = {}): HostBridge {
  return {
    kind: "electron",
    capabilities: {
      filePicker: false,
      mobileAccess: false,
      openFileExternal: false,
      proxy: false,
      notification: true,
      content: { editable: false },
    },
    getServerBaseUrl: vi.fn(async () => ""),
    getSettings: vi.fn(async () => null),
    saveSettings: vi.fn(async () => ({ success: true })),
    openExternal: vi.fn(),
    notify: vi.fn(),
    ...overrides,
  } as HostBridge;
}

describe("notifyUser", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { hasFocus: () => false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls bridge.notify when the feature and capability are on and the window is blurred", () => {
    const bridge = createBridge();
    notifyUser(bridge, "title", "body");
    expect(bridge.notify).toHaveBeenCalledWith("title", "body", undefined);
  });

  it("skips the OS notification when the window is focused", () => {
    vi.stubGlobal("document", { hasFocus: () => true });
    const bridge = createBridge();
    notifyUser(bridge, "title", "body");
    expect(bridge.notify).not.toHaveBeenCalled();
  });

  it("skips when the capability is off", () => {
    const bridge = createBridge({ capabilities: {
      filePicker: false,
      mobileAccess: false,
      openFileExternal: false,
      proxy: false,
      notification: false,
      content: { editable: false },
    } });
    notifyUser(bridge, "title", "body");
    expect(bridge.notify).not.toHaveBeenCalled();
  });

  it("notifies on web hosts too (matrix is ALL_HOSTS)", () => {
    const bridge = createBridge({ kind: "web" });
    notifyUser(bridge, "title", "body");
    expect(bridge.notify).toHaveBeenCalledWith("title", "body", undefined);
  });
});
