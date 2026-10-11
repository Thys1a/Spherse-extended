import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";

const { dispatchAction } = await import("../registry");
await import("./card");

function makeClient() {
  return {
    cardList: vi.fn(async () => [{ path: "g/w.card.json", name: "w", entryCount: 2, bytes: 10 }]),
    cardMeta: vi.fn(async () => ({
      spec: "chara_card_v3",
      name: "w",
      entryCount: 2,
      enabledCount: 1,
      regexCount: 0,
    })),
    cardEntries: vi.fn(async () => [{ id: 0 }]),
    cardSearch: vi.fn(async () => ({ total: 0, results: [] })),
    cardEntry: vi.fn(async () => ({ id: 0, content: "x" })),
    cardEntryMany: vi.fn(async (path: string, ids: number[]) => ids.map((id) => ({ id }))),
    cardEntryUpdate: vi.fn(async (path: string, id: number) => ({ id, changed: ["enabled"] })),
    cardEntryBulk: vi.fn(async () => ({ count: 2 })),
    cardEntryAdd: vi.fn(async () => ({ id: 5 })),
    cardEntryRemove: vi.fn(async () => ({ ok: true })),
  } as any;
}

function makeCtx(client: any) {
  const postMessage = vi.fn();
  return {
    client,
    projectId: "proj-1",
    navigate: vi.fn(),
    hostKind: "electron" as const,
    requestId: "req-1",
    source: { postMessage } as any,
  } as any;
}

function lastResponse(ctx: any) {
  const calls = ctx.source.postMessage.mock.calls;
  return calls[calls.length - 1]?.[0];
}

describe("card actions", () => {
  it("proxies list/meta/entries/search/entry/many/update/bulk", async () => {
    const client = makeClient();
    const ctx = makeCtx(client);
    await dispatchAction("card.list", {}, ctx);
    expect(client.cardList).toHaveBeenCalledWith(undefined);
    expect(lastResponse(ctx)).toMatchObject({ ok: true });
    await dispatchAction("card.meta", { path: "g/w.card.json" }, ctx);
    expect(client.cardMeta).toHaveBeenCalledWith("g/w.card.json");
    await dispatchAction("card.entries", { path: "g/w.card.json", filter: { enabled: true } }, ctx);
    expect(client.cardEntries).toHaveBeenCalledWith("g/w.card.json", { enabled: true });
    await dispatchAction(
      "card.search",
      { path: "g/w.card.json", query: "q", fields: ["keys"] },
      ctx,
    );
    expect(client.cardSearch).toHaveBeenCalledWith({
      path: "g/w.card.json",
      query: "q",
      fields: ["keys"],
    });
    await dispatchAction("card.entry", { path: "g/w.card.json", id: 0 }, ctx);
    expect(client.cardEntry).toHaveBeenCalledWith("g/w.card.json", 0);
    await dispatchAction("card.entry.many", { path: "g/w.card.json", ids: [0, 1] }, ctx);
    expect(client.cardEntryMany).toHaveBeenCalledWith("g/w.card.json", [0, 1]);
    await dispatchAction(
      "card.entry.update",
      { path: "g/w.card.json", id: 0, patch: { enabled: false } },
      ctx,
    );
    expect(client.cardEntryUpdate).toHaveBeenCalledWith(
      "g/w.card.json",
      0,
      { enabled: false },
      undefined,
    );
    await dispatchAction(
      "card.entry.bulk",
      { path: "g/w.card.json", ids: [0, 1], patch: { enabled: true } },
      ctx,
    );
    expect(client.cardEntryBulk).toHaveBeenCalledWith(
      "g/w.card.json",
      [0, 1],
      { enabled: true },
      undefined,
    );
  });

  it("proxies add/remove", async () => {
    const client = makeClient();
    const ctx = makeCtx(client);
    await dispatchAction("card.entry.add", { path: "g/w.card.json", entry: { comment: "n" } }, ctx);
    expect(client.cardEntryAdd).toHaveBeenCalledWith("g/w.card.json", { comment: "n" }, undefined);
    expect(lastResponse(ctx)).toMatchObject({ ok: true, data: { id: 5 } });
    await dispatchAction("card.entry.remove", { path: "g/w.card.json", id: 3 }, ctx);
    expect(client.cardEntryRemove).toHaveBeenCalledWith("g/w.card.json", 3);
    expect(lastResponse(ctx)).toMatchObject({ ok: true, data: { ok: true } });
  });

  it("rejects non .card.json files without responding", async () => {
    const ctx = makeCtx(makeClient());
    await dispatchAction("card.meta", { path: "g/w.data.json" }, ctx);
    expect(ctx.source.postMessage).not.toHaveBeenCalled();
    await dispatchAction("card.entry.update", { path: ".spherse/x.card.json", id: 0, patch: {} }, ctx);
    expect(ctx.source.postMessage).not.toHaveBeenCalled();
    await dispatchAction(
      "card.entry.update",
      { path: "g/.spherse/x.card.json", id: 0, patch: {} },
      ctx,
    );
    expect(ctx.source.postMessage).not.toHaveBeenCalled();
  });

  it("forwards the server error code", async () => {
    const client = makeClient();
    client.cardEntry.mockRejectedValueOnce(new ApiError("nope", 404, "entry_not_found"));
    const ctx = makeCtx(client);
    await dispatchAction("card.entry", { path: "g/w.card.json", id: 9 }, ctx);
    expect(lastResponse(ctx)).toEqual(
      expect.objectContaining({ ok: false, data: { error: "entry_not_found" } }),
    );
  });

  it("falls back to request_failed without a code", async () => {
    const client = makeClient();
    client.cardMeta.mockRejectedValueOnce(new Error("boom"));
    const ctx = makeCtx(client);
    await dispatchAction("card.meta", { path: "g/w.card.json" }, ctx);
    expect(lastResponse(ctx)).toEqual(
      expect.objectContaining({ ok: false, data: { error: "request_failed" } }),
    );
  });
});
