import { describe, it, expect, vi } from "vitest";
import { ValidationError } from "../../errors.js";
import { TriggerExecutor } from "../executor.js";
import type { SessionPort } from "../../kernel/ports.js";
import type { TriggerStore } from "../../store/trigger.js";
import type { TriggerEntry } from "../../types.js";

function makeEntry(overrides?: Partial<TriggerEntry>): TriggerEntry {
  return {
    id: "tr-1",
    enabled: true,
    type: "event",
    eventName: "evt",
    mode: "new_session",
    message: "Hello {{payload}}",
    notify: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeDeps(overrides?: {
  sendMessage?: SessionPort["sendMessage"];
  sessionExists?: SessionPort["sessionExists"];
}) {
  const session: SessionPort = {
    createSession: vi.fn(async () => "s-new"),
    restoreSession: vi.fn(async (_a: string, _s: string) => "s-restored"),
    sendMessage:
      overrides?.sendMessage ??
      (vi.fn(async (_sid: string, _msg: string, onEvent: (e: { type: string }) => void) => {
        onEvent({ type: "agent_end" });
      }) as unknown as SessionPort["sendMessage"]),
    abortSession: vi.fn(),
    sessionExists: overrides?.sessionExists ?? (vi.fn(() => false) as SessionPort["sessionExists"]),
  };
  const store = { update: vi.fn(), appendLog: vi.fn() } as unknown as TriggerStore;
  const getTriggerStore = vi.fn(() => store);
  const executor = new TriggerExecutor({ session, getTriggerStore });
  return { executor, session, store, getTriggerStore };
}

describe("TriggerExecutor", () => {
  it("creates a session, sends the templated message, logs success and emits lifecycle events", async () => {
    const { executor, session, store } = makeDeps();
    const triggered = vi.fn();
    const completed = vi.fn();
    executor.on("trigger_triggered", triggered);
    executor.on("trigger_completed", completed);

    await executor.fire(makeEntry(), "a1", "Agent", "world");

    expect(session.createSession).toHaveBeenCalledWith("a1", "triggered");
    expect(session.sendMessage).toHaveBeenCalledWith(
      "s-new",
      "Hello world",
      expect.any(Function),
      { source: "triggered", triggerName: "evt", triggerDepth: 1, triggerChainId: expect.any(String) },
    );
    expect(triggered).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "a1", triggerId: "tr-1" }),
    );
    expect(store.appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "success", sessionId: "s-new" }),
    );
    expect(completed).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "a1", triggerId: "tr-1", sessionId: "s-new", status: "success" }),
    );
  });

  it("skips the second fire of the same trigger in one chain", async () => {
    const { executor, session, store } = makeDeps();
    const opts = { chainId: "chain-1", depth: 0 };

    await executor.fire(makeEntry(), "a1", "Agent", "first", "evt", opts);
    await executor.fire(makeEntry(), "a1", "Agent", "second", "evt", opts);

    expect(session.sendMessage).toHaveBeenCalledTimes(1);
    expect(store.appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: expect.stringContaining("already fired in this chain") }),
    );
  });

  it("records a failed log and emits trigger_failed when send fails", async () => {
    const { executor, store } = makeDeps({
      sendMessage: vi.fn(async () => {
        throw new Error("boom");
      }) as unknown as SessionPort["sendMessage"],
    });
    const failed = vi.fn();
    executor.on("trigger_failed", failed);

    await executor.fire(makeEntry(), "a1", "Agent", "");

    expect(store.appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: "Error: boom" }),
    );
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "a1", triggerId: "tr-1", error: "Error: boom" }),
    );
  });

  it("records a failed log and emits trigger_failed when the turn ends with stopReason error", async () => {
    const { executor, store } = makeDeps({
      sendMessage: vi.fn(async (
        _sid: string,
        _msg: string,
        onEvent: (e: { type: string; messages?: Array<{ role: string; stopReason?: string; errorMessage?: string }> }) => void,
      ) => {
        onEvent({
          type: "agent_end",
          messages: [{ role: "assistant", stopReason: "error", errorMessage: "stream dropped" }],
        });
      }) as unknown as SessionPort["sendMessage"],
    });
    const failed = vi.fn();
    const completed = vi.fn();
    executor.on("trigger_failed", failed);
    executor.on("trigger_completed", completed);

    await executor.fire(makeEntry(), "a1", "Agent", "");

    expect(store.appendLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        sessionId: "s-new",
        error: expect.stringContaining("stream dropped"),
      }),
    );
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "a1", triggerId: "tr-1" }),
    );
    expect(completed).not.toHaveBeenCalled();
  });

  it("records a failed log when the turn ends with stopReason aborted", async () => {
    const { executor, store } = makeDeps({
      sendMessage: vi.fn(async (
        _sid: string,
        _msg: string,
        onEvent: (e: { type: string; messages?: Array<{ role: string; stopReason?: string }> }) => void,
      ) => {
        onEvent({
          type: "agent_end",
          messages: [{ role: "assistant", stopReason: "aborted" }],
        });
      }) as unknown as SessionPort["sendMessage"],
    });

    await executor.fire(makeEntry(), "a1", "Agent", "");

    expect(store.appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: expect.stringContaining("aborted") }),
    );
  });

  it("recovers when the trigger_triggered listener throws", async () => {
    const { executor, store } = makeDeps();
    executor.on("trigger_triggered", () => {
      throw new Error("listener boom");
    });
    const failed = vi.fn();
    executor.on("trigger_failed", failed);

    await executor.fire(makeEntry(), "a1", "Agent", "");

    expect(executor.isRunning("tr-1")).toBe(false);
    expect(store.appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: "Error: listener boom" }),
    );
    expect(failed).toHaveBeenCalled();
  });

  it("restores the configured target in existing_session mode without creating", async () => {
    const { executor, session } = makeDeps({
      sessionExists: vi.fn(() => true) as unknown as SessionPort["sessionExists"],
    });
    await executor.fire(
      makeEntry({ mode: "existing_session", targetSessionId: "s-target" }),
      "a1",
      "Agent",
      "",
    );
    expect(session.restoreSession).toHaveBeenCalledWith("a1", "s-target");
    expect(session.createSession).not.toHaveBeenCalled();
  });

  it("fails without restoring when the existing_session target is not active", async () => {
    const { executor, session, store } = makeDeps({
      sessionExists: vi.fn(() => false) as unknown as SessionPort["sessionExists"],
    });
    const failed = vi.fn();
    executor.on("trigger_failed", failed);

    await executor.fire(
      makeEntry({ mode: "existing_session", targetSessionId: "s-gone" }),
      "a1",
      "Agent",
      "",
    );

    expect(session.restoreSession).not.toHaveBeenCalled();
    expect(session.createSession).not.toHaveBeenCalled();
    expect(session.sendMessage).not.toHaveBeenCalled();
    expect(store.appendLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("not an active session"),
      }),
    );
    expect(failed).toHaveBeenCalled();
  });

  it("fails when existing_session has no targetSessionId", async () => {
    const { executor, store } = makeDeps();
    const failed = vi.fn();
    executor.on("trigger_failed", failed);

    await executor.fire(makeEntry({ mode: "existing_session" }), "a1", "Agent", "");

    expect(failed).toHaveBeenCalled();
    expect(store.appendLog).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("reuses the bound session when it still exists", async () => {
    const { executor, session, store } = makeDeps({
      sessionExists: vi.fn(() => true) as unknown as SessionPort["sessionExists"],
    });
    await executor.fire(makeEntry({ mode: "reusable_session", boundSessionId: "s-bound" }), "a1", "Agent", "");
    expect(session.restoreSession).toHaveBeenCalledWith("a1", "s-bound");
    expect(session.createSession).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  it("creates and binds a fresh session when the bound one is gone", async () => {
    const { executor, session, store } = makeDeps({
      sessionExists: vi.fn(() => false) as unknown as SessionPort["sessionExists"],
    });
    await executor.fire(makeEntry({ mode: "reusable_session", boundSessionId: "s-gone" }), "a1", "Agent", "");
    expect(session.createSession).toHaveBeenCalledWith("a1", "triggered");
    expect(store.update).toHaveBeenCalledWith("tr-1", { boundSessionId: "s-new" });
  });

  it("fails on unknown mode", async () => {
    const { executor, store } = makeDeps();
    const failed = vi.fn();
    executor.on("trigger_failed", failed);

    await executor.fire(makeEntry({ mode: "nope" as TriggerEntry["mode"] }), "a1", "Agent", "");

    expect(failed).toHaveBeenCalled();
    expect(store.appendLog).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("guards concurrent fires of the same trigger id", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { executor, session } = makeDeps({
      sendMessage: vi.fn(async () => {
        await gate;
      }) as unknown as SessionPort["sendMessage"],
    });

    const first = executor.fire(makeEntry(), "a1", "Agent", "");
    expect(executor.isRunning("tr-1")).toBe(true);
    await executor.fire(makeEntry(), "a1", "Agent", "");
    release();
    await first;

    expect((session.sendMessage as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(executor.isRunning("tr-1")).toBe(false);
  });

  it("falls back to eventName when the trigger has no name", async () => {
    const { executor, store } = makeDeps();
    await executor.fire(makeEntry({ name: undefined }), "a1", "Agent", "");
    expect(store.appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ triggerName: "evt" }),
    );
  });

  it("passes depth+1 and the chain through to the new turn", async () => {
    const { executor, session } = makeDeps();
    await executor.fire(makeEntry(), "a1", "Agent", "", "evt", { depth: 2, chainId: "chain-1" });
    expect(session.sendMessage).toHaveBeenCalledWith(
      "s-new",
      expect.any(String),
      expect.any(Function),
      { source: "triggered", triggerName: "evt", triggerDepth: 3, triggerChainId: "chain-1" },
    );
  });

  it("rejects fires at max depth without sending", async () => {
    const { executor, session, store } = makeDeps();
    const failed = vi.fn();
    executor.on("trigger_failed", failed);

    await executor.fire(makeEntry(), "a1", "Agent", "", "evt", { depth: 5, chainId: "chain-1" });

    expect(session.sendMessage).not.toHaveBeenCalled();
    expect(session.createSession).not.toHaveBeenCalled();
    expect(store.appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: expect.stringContaining("max trigger depth") }),
    );
    expect(failed).not.toHaveBeenCalled();
    expect(executor.isRunning("tr-1")).toBe(false);
  });

  it("skips refiring the same trigger within one chain (ping-pong guard)", async () => {
    const { executor, session, store } = makeDeps();
    await executor.fire(makeEntry(), "a1", "Agent", "", "evt", { depth: 0, chainId: "chain-1" });
    await executor.fire(makeEntry(), "a1", "Agent", "", "evt", { depth: 1, chainId: "chain-1" });

    expect(session.sendMessage).toHaveBeenCalledTimes(1);
    expect(store.appendLog).toHaveBeenCalledTimes(3);
    expect(store.appendLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed", error: expect.stringContaining("already fired in this chain") }),
    );
  });

  it("evicts old chains so tracking stays bounded", async () => {
    const { executor, session } = makeDeps();
    await executor.fire(makeEntry(), "a1", "Agent", "", "evt", { depth: 0, chainId: "chain-0" });
    for (let i = 1; i <= 1024; i++) {
      await executor.fire(makeEntry(), "a1", "Agent", "", "evt", { depth: 0, chainId: `chain-${i}` });
    }
    await executor.fire(makeEntry(), "a1", "Agent", "", "evt", { depth: 0, chainId: "chain-0" });

    expect(session.sendMessage).toHaveBeenCalledTimes(1026);
  });

  it("allows the same trigger again in a fresh chain", async () => {
    const { executor, session } = makeDeps();
    await executor.fire(makeEntry(), "a1", "Agent", "", "evt");
    await executor.fire(makeEntry(), "a1", "Agent", "", "evt");

    expect(session.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("defers a busy-session fire and retries it on drainDeferred", async () => {
    let calls = 0;
    const { executor, session, store } = makeDeps({
      sessionExists: vi.fn(() => true) as unknown as SessionPort["sessionExists"],
      sendMessage: vi.fn(async (_sid: string, _msg: string, onEvent: (e: { type: string }) => void) => {
        calls++;
        if (calls === 1) throw new ValidationError("Session \"s1\" already has a turn in progress");
        onEvent({ type: "agent_end" });
      }) as unknown as SessionPort["sendMessage"],
    });
    const entry = makeEntry({ mode: "existing_session", targetSessionId: "s1" });
    await executor.fire(entry, "a1", "Agent", "");

    expect(session.sendMessage).toHaveBeenCalledTimes(1);
    expect(store.appendLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed", error: expect.stringContaining("deferred until turn end") }),
    );

    executor.drainDeferred("s1");
    await vi.waitFor(() => {
      expect(session.sendMessage).toHaveBeenCalledTimes(2);
    });
    expect(store.appendLog).toHaveBeenLastCalledWith(expect.objectContaining({ status: "success" }));
  });

  it("drops a deferred fire that is still busy after retry", async () => {
    const { executor, session, store } = makeDeps({
      sessionExists: vi.fn(() => true) as unknown as SessionPort["sessionExists"],
      sendMessage: vi.fn(async () => {
        throw new ValidationError("Session \"s1\" already has a turn in progress");
      }) as unknown as SessionPort["sendMessage"],
    });
    const entry = makeEntry({ mode: "existing_session", targetSessionId: "s1" });
    await executor.fire(entry, "a1", "Agent", "");
    executor.drainDeferred("s1");
    await vi.waitFor(() => {
      expect(session.sendMessage).toHaveBeenCalledTimes(2);
    });
    expect(store.appendLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed", error: expect.stringContaining("skipped") }),
    );
    expect(session.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("forgets in-flight ids on forgetAll", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { executor } = makeDeps({
      sendMessage: vi.fn(async () => {
        await gate;
      }) as unknown as SessionPort["sendMessage"],
    });
    const first = executor.fire(makeEntry(), "a1", "Agent", "");
    expect(executor.isRunning("tr-1")).toBe(true);
    executor.forgetAll();
    expect(executor.isRunning("tr-1")).toBe(false);
    release();
    await first;
  });
});
