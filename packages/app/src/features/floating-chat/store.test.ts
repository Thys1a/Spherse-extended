import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDetachedFloatStore } from "../../stores/detached-float-store";
import { floatKey, registerNativeFloatFocus } from "../../lib/float-window";
import { useFloatingChatStore } from "./store";

describe("useFloatingChatStore", () => {
  beforeEach(() => {
    useFloatingChatStore.setState({ byProject: {} });
    useDetachedFloatStore.setState({ keys: new Set() });
    registerNativeFloatFocus(null);
  });

  it("sets and reads floating chat per project", () => {
    useFloatingChatStore.getState().setFloatingChat("project-1", {
      sessionId: "session-1",
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      mode: "full",
    });

    expect(useFloatingChatStore.getState().byProject["project-1"]?.sessionId).toBe("session-1");
  });

  it("clears one project while keeping others", () => {
    useFloatingChatStore.getState().setFloatingChat("project-2", {
      sessionId: "session-1",
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      mode: "pet",
    });
    useFloatingChatStore.getState().clearProject("project-1");

    expect(useFloatingChatStore.getState().byProject["project-1"]).toBeUndefined();
    expect(useFloatingChatStore.getState().byProject["project-2"]).toBeDefined();
  });

  it("removes floating chat when set to null", () => {
    useFloatingChatStore.getState().setFloatingChat("project-1", {
      sessionId: "session-1",
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      mode: "full",
    });
    useFloatingChatStore.getState().setFloatingChat("project-1", null);

    expect(useFloatingChatStore.getState().byProject["project-1"]).toBeUndefined();
  });

  it("preserves the mode across position and size commits", () => {    useFloatingChatStore.getState().setFloatingChat("project-1", {
      sessionId: "session-1",
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      mode: "pet",
    });
    const current = useFloatingChatStore.getState().byProject["project-1"]!;
    useFloatingChatStore.getState().setFloatingChat("project-1", {
      ...current,
      position: { x: 10, y: 20 },
    });

    expect(useFloatingChatStore.getState().byProject["project-1"]?.mode).toBe("pet");
  });

  it("focuses the native window instead of creating an overlay when detached", () => {
    const focus = vi.fn();
    registerNativeFloatFocus(focus);
    useDetachedFloatStore.getState().add(floatKey("chat", "project-1", "session-1"));

    useFloatingChatStore.getState().setFloatingChat("project-1", {
      sessionId: "session-1",
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      mode: "full",
    });

    expect(focus).toHaveBeenCalledWith("chat", "project-1", "session-1");
    expect(useFloatingChatStore.getState().byProject["project-1"]).toBeUndefined();
  });

  it("still clears detached entries when set to null", () => {
    useDetachedFloatStore.getState().add(floatKey("chat", "project-1", "session-1"));
    useFloatingChatStore.getState().setFloatingChat("project-1", null);

    expect(useFloatingChatStore.getState().byProject["project-1"]).toBeUndefined();
  });
});
