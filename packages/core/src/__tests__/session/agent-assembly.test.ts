import { describe, expect, it } from "vitest";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { withOpenCodeSessionHeader } from "../../session/agent-assembly.js";

function fakeBase() {
  const calls: Array<{ model: unknown; options: unknown }> = [];
  const base: StreamFn = (model, _context, options) => {
    calls.push({ model, options });
    return undefined as never;
  };
  return { base, calls };
}

describe("withOpenCodeSessionHeader", () => {
  it("injects x-opencode-session for opencode-go models", () => {
    const { base, calls } = fakeBase();
    const fn = withOpenCodeSessionHeader("session-1", base);
    fn({ provider: "opencode-go" } as never, [] as never, {} as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toMatchObject({
      headers: { "x-opencode-session": "session-1" },
    });
  });

  it("injects for opencode (zen) models too", () => {
    const { base, calls } = fakeBase();
    const fn = withOpenCodeSessionHeader("session-1", base);
    fn({ provider: "opencode" } as never, [] as never, undefined);
    expect(calls[0].options).toMatchObject({
      headers: { "x-opencode-session": "session-1" },
    });
  });

  it("does not inject for other providers", () => {
    const { base, calls } = fakeBase();
    const fn = withOpenCodeSessionHeader("session-1", base);
    fn({ provider: "deepseek" } as never, [] as never, { apiKey: "sk-test" } as never);
    expect(calls[0].options).toEqual({ apiKey: "sk-test" });
  });

  it("preserves existing headers and lets them win on conflict", () => {
    const { base, calls } = fakeBase();
    const fn = withOpenCodeSessionHeader("session-1", base);
    fn(
      { provider: "opencode-go" } as never,
      [] as never,
      { headers: { "X-Custom": "v", "x-opencode-session": "override" } } as never,
    );
    expect(calls[0].options).toMatchObject({
      headers: { "x-opencode-session": "override", "X-Custom": "v" },
    });
  });

  it("keeps the session id stable across calls within a session", () => {
    const { base, calls } = fakeBase();
    const fn = withOpenCodeSessionHeader("stable-id", base);
    fn({ provider: "opencode-go" } as never, [] as never, {} as never);
    fn({ provider: "opencode-go" } as never, [] as never, {} as never);
    expect(calls[0].options).toMatchObject({ headers: { "x-opencode-session": "stable-id" } });
    expect(calls[1].options).toMatchObject({ headers: { "x-opencode-session": "stable-id" } });
  });
});