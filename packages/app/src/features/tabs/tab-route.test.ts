import { describe, expect, it } from "vitest";
import { tabToRoute, routeToTabSpec } from "./tab-route";
import type { Tab } from "./tab-store";

function makeTab(partial: Partial<Tab> & { kind: Tab["kind"] }): Tab {
  return { id: "id", projectId: "p1", label: "", ...partial };
}

describe("tabToRoute", () => {
  it("maps chat tab to chat route", () => {
    expect(tabToRoute(makeTab({ kind: "chat", sessionId: "s1" }))).toBe("/project/p1/chat/s1");
  });

  it("maps content tab to content route with encoded path", () => {
    expect(tabToRoute(makeTab({ kind: "content", filePath: "a b/c.md" }))).toBe(
      "/project/p1/content?path=a%20b%2Fc.md",
    );
  });

  it("maps browser tab to browser route with encoded url", () => {
    expect(tabToRoute(makeTab({ kind: "browser", url: "http://localhost:3000/?x=1" }))).toBe(
      "/project/p1/browser?url=http%3A%2F%2Flocalhost%3A3000%2F%3Fx%3D1",
    );
  });

  it("maps home tab to project index", () => {
    expect(tabToRoute(makeTab({ kind: "home" }))).toBe("/project/p1");
  });
});

describe("routeToTabSpec", () => {
  it("parses project index to home spec", () => {
    expect(routeToTabSpec("p1", "/project/p1", "")).toEqual({ kind: "home", label: "" });
  });

  it("parses chat route to chat spec", () => {
    expect(routeToTabSpec("p1", "/project/p1/chat/s1", "")).toEqual({
      kind: "chat",
      label: "s1",
      sessionId: "s1",
    });
  });

  it("parses content route to content spec with basename label", () => {
    expect(routeToTabSpec("p1", "/project/p1/content", "?path=notes%2Fa.md")).toEqual({
      kind: "content",
      label: "a.md",
      filePath: "notes/a.md",
    });
  });

  it("parses browser route to browser spec", () => {
    expect(routeToTabSpec("p1", "/project/p1/browser", "?url=http%3A%2F%2Flocalhost%3A3000")).toEqual({
      kind: "browser",
      label: "http://localhost:3000",
      url: "http://localhost:3000",
    });
  });

  it("returns null for missing query or unknown routes", () => {
    expect(routeToTabSpec("p1", "/project/p1/content", "")).toBeNull();
    expect(routeToTabSpec("p1", "/project/p1/browser", "")).toBeNull();
    expect(routeToTabSpec("p1", "/project/p1/chat/", "")).toBeNull();
    expect(routeToTabSpec("p1", "/project/p1/unknown", "")).toBeNull();
    expect(routeToTabSpec("p1", "/", "")).toBeNull();
    expect(routeToTabSpec("p1", "/project/other/chat/s1", "")).toBeNull();
  });
});
