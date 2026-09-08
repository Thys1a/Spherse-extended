import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../queries/project", () => ({
  ensureProjectSession: vi.fn(),
}));

const { dispatchAction } = await import("../registry");
await import("./chat-dock");
const { useDockedChatStore } = await import("../../features/docked-chat/store");
const { ensureProjectSession } = await import("../../queries/project");

const ensureSession = vi.mocked(ensureProjectSession);

function makeSource(): MessageEventSource {
  return { postMessage: vi.fn() } as unknown as MessageEventSource;
}

function makeCtx(source: MessageEventSource | null, withRespond = true) {
  return {
    projectId: "p1",
    navigate: vi.fn(),
    hostKind: "electron",
    client: {},
    source,
    ...(withRespond ? { requestId: "req-1" } : {}),
  } as any;
}

function makeIframe(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  return iframe;
}

describe("chat-dock actions", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    for (const source of Array.from(useDockedChatStore.getState().entries.keys())) {
      useDockedChatStore.getState().undock(source);
    }
    ensureSession.mockReset();
    ensureSession.mockResolvedValue({ id: "s1" } as any);
  });

  it("chat.dock stores an entry and responds ok", async () => {
    const iframe = makeIframe();
    const source = iframe.contentWindow as unknown as MessageEventSource;
    const ctx = makeCtx(source);

    await dispatchAction("chat.dock", { sessionId: "s1" }, ctx);

    const entry = useDockedChatStore.getState().entries.get(source);
    expect(entry).toMatchObject({ sessionId: "s1", slotRect: null, iframe });
    expect(ctx.requestId).toBeTruthy();
  });

  it("chat.dock responds ok payload through respond()", async () => {
    const iframe = makeIframe();
    const source = iframe.contentWindow as unknown as MessageEventSource;
    const postMessage = vi.spyOn(source as WindowProxy, "postMessage");

    await dispatchAction("chat.dock", { sessionId: "s1" }, makeCtx(source));

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "spherse:response", ok: true }),
      "*",
    );
  });

  it("chat.dock rejects a session outside the project", async () => {
    const iframe = makeIframe();
    const source = iframe.contentWindow as unknown as MessageEventSource;
    ensureSession.mockResolvedValue(null);
    const postMessage = vi.spyOn(source as WindowProxy, "postMessage");

    await dispatchAction("chat.dock", { sessionId: "bad" }, makeCtx(source));

    expect(useDockedChatStore.getState().entries.size).toBe(0);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, data: { error: "session_not_found" } }),
      "*",
    );
  });

  it("chat.dock rejects when the source does not match any iframe", async () => {
    const source = makeSource();
    const postMessage = vi.spyOn(source as WindowProxy, "postMessage");

    await dispatchAction("chat.dock", { sessionId: "s1" }, makeCtx(source));

    expect(useDockedChatStore.getState().entries.size).toBe(0);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, data: { error: "iframe_not_found" } }),
      "*",
    );
  });

  it("chat.dock rejects a missing sessionId", async () => {
    const source = makeSource();
    const postMessage = vi.spyOn(source as WindowProxy, "postMessage");

    await dispatchAction("chat.dock", {}, makeCtx(source));

    expect(useDockedChatStore.getState().entries.size).toBe(0);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, data: { error: "invalid_params" } }),
      "*",
    );
  });

  it("chat.dock rejects iframes inside an existing docked panel (no recursion)", async () => {
    const panel = document.createElement("div");
    panel.setAttribute("data-docked-chat-panel", "true");
    document.body.appendChild(panel);
    const iframe = document.createElement("iframe");
    panel.appendChild(iframe);
    const source = iframe.contentWindow as unknown as MessageEventSource;
    const postMessage = vi.spyOn(source as WindowProxy, "postMessage");

    await dispatchAction("chat.dock", { sessionId: "s1" }, makeCtx(source));

    expect(useDockedChatStore.getState().entries.size).toBe(0);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, data: { error: "dock_not_allowed" } }),
      "*",
    );
  });

  it("chat.rect updates the slot rect of the docked source", () => {
    const iframe = makeIframe();
    const source = iframe.contentWindow as unknown as MessageEventSource;
    useDockedChatStore.getState().dock(source, "s1", iframe);

    dispatchAction("chat.rect", { x: 5, y: 6, width: 100, height: 50 }, makeCtx(source, false));

    expect(useDockedChatStore.getState().entries.get(source)?.slotRect).toEqual({
      x: 5, y: 6, width: 100, height: 50,
    });
  });

  it("chat.rect ignores unknown sources and non-finite values", () => {
    const source = makeSource();

    dispatchAction("chat.rect", { x: 1, y: 2, width: 3, height: 4 }, makeCtx(source, false));
    expect(useDockedChatStore.getState().entries.size).toBe(0);

    const iframe = makeIframe();
    const winSource = iframe.contentWindow as unknown as MessageEventSource;
    useDockedChatStore.getState().dock(winSource, "s1", iframe);

    dispatchAction(
      "chat.rect",
      { x: Number.NaN, y: 2, width: 3, height: 4 },
      makeCtx(winSource, false),
    );
    expect(useDockedChatStore.getState().entries.get(winSource)?.slotRect).toBeNull();

    dispatchAction(
      "chat.rect",
      { x: 1, y: 2, width: 0, height: 4 },
      makeCtx(winSource, false),
    );
    expect(useDockedChatStore.getState().entries.get(winSource)?.slotRect).toBeNull();
  });

  it("chat.undock removes the docked entry", () => {
    const iframe = makeIframe();
    const source = iframe.contentWindow as unknown as MessageEventSource;
    useDockedChatStore.getState().dock(source, "s1", iframe);

    dispatchAction("chat.undock", {}, makeCtx(source, false));

    expect(useDockedChatStore.getState().entries.size).toBe(0);
  });
});