import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mockGetRuntime = vi.fn();

vi.mock("../runtime/context.js", () => ({
  getRuntime: mockGetRuntime,
}));

interface ActionMsg {
  type: "spherse:action";
  action: string;
  params: Record<string, unknown>;
  sdk: string;
}

type DockModule = typeof import("../runtime/dock.js");
type MessagingModule = typeof import("../runtime/messaging.js");

let posted: ActionMsg[];
let dock: DockModule | undefined;

function setRuntime(sessionId: string | undefined): void {
  mockGetRuntime.mockImplementation(() =>
    Promise.resolve(sessionId ? { sessionId } : {}),
  );
}

async function loadDock(sessionId?: string): Promise<DockModule> {
  vi.resetModules();
  setRuntime(sessionId);
  dock = await import("../runtime/dock.js");
  const messaging: MessagingModule = await import("../runtime/messaging.js");
  messaging.installResponseListener();
  return dock;
}

function addSlot(): HTMLElement {
  const slot = document.createElement("spherse-chat");
  document.body.appendChild(slot);
  return slot;
}

function stubRect(slot: HTMLElement): HTMLElement {
  vi.spyOn(slot, "getBoundingClientRect").mockReturnValue({
    left: 10, top: 20, width: 300, height: 200,
    right: 310, bottom: 220, x: 10, y: 20,
    toJSON: () => ({}),
  } as DOMRect);
  return slot;
}

/** Flush MutationObserver microtasks. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("dock", () => {
  beforeEach(() => {
    posted = [];
    dock = undefined;
    document.body.innerHTML = "";
    setRuntime(undefined);
    Object.defineProperty(window, "parent", {
      value: {
        postMessage: (msg: ActionMsg) => {
          posted.push(msg);
          if (msg.requestId) {
            window.dispatchEvent(
              new MessageEvent("message", {
                data: { type: "spherse:response", requestId: msg.requestId, ok: true },
              }),
            );
          }
        },
      },
      configurable: true,
    });
  });

  afterEach(() => {
    dock?.undock();
    setRuntime(undefined);
  });

  it("dockChat without a slot does nothing", async () => {
    const mod = await loadDock("s1");
    await mod.dockChat();
    expect(posted).toHaveLength(0);
  });

  it("dockChat without any sessionId does nothing", async () => {
    const mod = await loadDock();
    addSlot();
    await mod.dockChat();
    expect(posted).toHaveLength(0);
  });

  it("dockChat fires chat.dock then a rect message", async () => {
    const mod = await loadDock("s1");
    stubRect(addSlot());

    await mod.dockChat();

    expect(posted).toHaveLength(2);
    expect(posted[0].action).toBe("chat.dock");
    expect(posted[0].params).toEqual({ sessionId: "s1" });
    expect(posted[1].action).toBe("chat.rect");
    expect(posted[1].params).toMatchObject({
      sessionId: "s1", x: 10, y: 20, width: 300, height: 200,
    });
  });

  it("explicit sessionId overrides the runtime session", async () => {
    const mod = await loadDock("runtime-s");
    stubRect(addSlot());

    await mod.dockChat({ sessionId: "explicit-s" });

    expect(posted[0].params).toEqual({ sessionId: "explicit-s" });
    expect(posted[1].params).toMatchObject({ sessionId: "explicit-s" });
  });

  it("undock fires chat.undock only when docked, and clears state", async () => {
    const mod = await loadDock("s1");
    stubRect(addSlot());

    await mod.dockChat();
    expect(posted).toHaveLength(2);

    mod.undock();
    expect(posted).toHaveLength(3);
    expect(posted[2].action).toBe("chat.undock");

    mod.undock();
    expect(posted).toHaveLength(3);
  });

  it("undocks automatically when the slot element is removed", async () => {
    const mod = await loadDock("s1");
    const slot = stubRect(addSlot());

    await mod.dockChat();
    expect(posted).toHaveLength(2);

    slot.remove();
    await flush();

    expect(posted).toHaveLength(3);
    expect(posted[2].action).toBe("chat.undock");
  });

  it("installAutoDock docks when runtime is already seeded", async () => {
    const mod = await loadDock("auto-s");
    stubRect(addSlot());

    mod.installAutoDock();
    await flush();

    expect(posted).toHaveLength(2);
    expect(posted[0].action).toBe("chat.dock");
    expect(posted[0].params).toEqual({ sessionId: "auto-s" });
  });

  it("pagehide undocks", async () => {
    const mod = await loadDock("s1");
    stubRect(addSlot());

    mod.installAutoDock();
    await flush();
    expect(posted).toHaveLength(2);

    window.dispatchEvent(new Event("pagehide"));
    await flush();

    expect(posted).toHaveLength(3);
    expect(posted[2].action).toBe("chat.undock");
  });
});