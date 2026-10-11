import { beforeEach, describe, expect, it, vi } from "vitest";
import { installResponseListener } from "../runtime/messaging.js";
import { card } from "../runtime/card.js";

type ActionMsg = {
  type: "spherse:action";
  action: string;
  params: Record<string, unknown>;
  requestId?: string;
};

let messages: ActionMsg[];

beforeEach(() => {
  messages = [];
  const postMessage = vi.fn((msg: ActionMsg) => {
    messages.push(msg);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "spherse:response", requestId: msg.requestId, ok: true, data: { ok: true } },
      }),
    );
  });
  Object.defineProperty(window, "parent", {
    value: { postMessage },
    configurable: true,
  });
  installResponseListener();
});

describe("card runtime", () => {
  it("forwards action names and params", async () => {
    await card.list({ dir: "game" });
    await card.meta({ path: "g/w.card.json" });
    await card.entries({ path: "g/w.card.json", filter: { enabled: true } });
    await card.search({ path: "g/w.card.json", query: "q" });
    await card.entry({ path: "g/w.card.json", id: 0 });
    await card.many({ path: "g/w.card.json", ids: [0] });
    await card.update({ path: "g/w.card.json", id: 0, patch: { enabled: false } });
    await card.bulk({ path: "g/w.card.json", ids: [0], patch: { enabled: true } });
    await card.add({ path: "g/w.card.json", entry: { comment: "n" } });
    await card.remove({ path: "g/w.card.json", id: 3 });
    expect(messages.map((m) => m.action)).toEqual([
      "card.list",
      "card.meta",
      "card.entries",
      "card.search",
      "card.entry",
      "card.entry.many",
      "card.entry.update",
      "card.entry.bulk",
      "card.entry.add",
      "card.entry.remove",
    ]);
    expect(messages[3].params).toEqual({ path: "g/w.card.json", query: "q" });
    expect(messages[6].params).toEqual({
      path: "g/w.card.json",
      id: 0,
      patch: { enabled: false },
    });
  });
});
