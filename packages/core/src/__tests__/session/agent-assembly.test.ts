import { describe, expect, it } from "vitest";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { composeStreamFn } from "../../session/agent-assembly.js";

function fakeCatalog(streamFn: StreamFn) {
  return { getChatStreamFn: () => streamFn };
}

function captureBase() {
  const calls: Array<{ model: unknown; options: unknown }> = [];
  const base: StreamFn = (model, _context, options) => {
    calls.push({ model, options });
    return undefined as never;
  };
  return { calls, base };
}

describe("composeStreamFn opencode session header", () => {
  it("injects x-opencode-session from options.sessionId for opencode-go models", () => {
    const { base, calls } = captureBase();
    const fn = composeStreamFn(fakeCatalog(base), undefined);
    fn(
      { provider: "opencode-go" } as never,
      [] as never,
      { sessionId: "session-1" } as never,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toMatchObject({
      headers: { "x-opencode-session": "session-1" },
    });
  });

  it("injects for opencode (zen) models too", () => {
    const { base, calls } = captureBase();
    const fn = composeStreamFn(fakeCatalog(base), undefined);
    fn({ provider: "opencode" } as never, [] as never, { sessionId: "s2" } as never);
    expect(calls[0].options).toMatchObject({
      headers: { "x-opencode-session": "s2" },
    });
  });

  it("does not inject when sessionId is absent", () => {
    const { base, calls } = captureBase();
    const fn = composeStreamFn(fakeCatalog(base), undefined);
    fn({ provider: "opencode-go" } as never, [] as never, {} as never);
    expect(calls[0].options).not.toHaveProperty("headers");
  });

  it("does not inject for other providers", () => {
    const { base, calls } = captureBase();
    const fn = composeStreamFn(fakeCatalog(base), undefined);
    fn(
      { provider: "deepseek" } as never,
      [] as never,
      { sessionId: "s1", apiKey: "sk-test" } as never,
    );
    expect(calls[0].options).toMatchObject({ sessionId: "s1", apiKey: "sk-test" });
    expect(calls[0].options).not.toHaveProperty("headers");
  });

  it("preserves existing headers and lets caller-provided values win", () => {
    const { base, calls } = captureBase();
    const fn = composeStreamFn(fakeCatalog(base), undefined);
    fn(
      { provider: "opencode-go" } as never,
      [] as never,
      {
        sessionId: "s1",
        headers: { "X-Custom": "v", "x-opencode-session": "override" },
      } as never,
    );
    expect(calls[0].options).toMatchObject({
      headers: { "x-opencode-session": "override", "X-Custom": "v" },
    });
  });

  it("applies default maxRetries while injecting", () => {
    const { base, calls } = captureBase();
    const fn = composeStreamFn(fakeCatalog(base), undefined);
    fn({ provider: "opencode-go" } as never, [] as never, { sessionId: "s1" } as never);
    expect(calls[0].options).toMatchObject({
      maxRetries: 1,
      headers: { "x-opencode-session": "s1" },
    });
  });
});