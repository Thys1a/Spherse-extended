import { describe, expect, it } from "vitest";
import { parseContract, schemas } from "../index.js";

describe("card contracts", () => {
  it("accepts valid search / update / bulk requests", () => {
    expect(
      parseContract(schemas.cardSearchRequest, {
        path: "game/world.card.json",
        query: "雷恩",
        fields: ["keys", "comment"],
        onlyEnabled: true,
        limit: 20,
        snippetChars: 160,
      }),
    ).toEqual({
      path: "game/world.card.json",
      query: "雷恩",
      fields: ["keys", "comment"],
      onlyEnabled: true,
      limit: 20,
      snippetChars: 160,
    });
    expect(
      parseContract(schemas.cardEntryUpdateRequest, {
        path: "game/world.card.json",
        id: 0,
        patch: { enabled: false, comment: "x" },
      }),
    ).toEqual({
      path: "game/world.card.json",
      id: 0,
      patch: { enabled: false, comment: "x" },
    });
    expect(
      parseContract(schemas.cardEntryBulkRequest, {
        path: "game/world.card.json",
        ids: [0, 1],
        patch: { enabled: true },
        idempotencyKey: "k1",
      }),
    ).toEqual({
      path: "game/world.card.json",
      ids: [0, 1],
      patch: { enabled: true },
      idempotencyKey: "k1",
    });
  });

  it("accepts a minimal update with empty patch", () => {
    expect(
      parseContract(schemas.cardEntryUpdateRequest, {
        path: "game/world.card.json",
        id: 3,
        patch: {},
      }),
    ).toEqual({ path: "game/world.card.json", id: 3, patch: {} });
  });

  it("rejects missing path", () => {
    expect(() => parseContract(schemas.cardMetaRequest, {})).toThrow(/Invalid payload/);
    expect(() => parseContract(schemas.cardEntryRequest, { path: "a.card.json" })).toThrow(
      /Invalid payload/,
    );
  });

  it("rejects illegal field and position values", () => {
    expect(() =>
      parseContract(schemas.cardSearchRequest, {
        path: "a.card.json",
        fields: ["content", "nope"],
      }),
    ).toThrow(/Invalid payload/);
    expect(() =>
      parseContract(schemas.cardEntryUpdateRequest, {
        path: "a.card.json",
        id: 0,
        patch: { position: "middle_earth" },
      }),
    ).toThrow(/Invalid payload/);
    expect(() =>
      parseContract(schemas.cardEntryUpdateRequest, {
        path: "a.card.json",
        id: 0,
        patch: { enabled: "yes" },
      }),
    ).toThrow(/Invalid payload/);
  });

  it("rejects unknown patch keys instead of stripping them", () => {
    expect(() =>
      parseContract(schemas.cardEntryUpdateRequest, {
        path: "a.card.json",
        id: 0,
        patch: { id: 9 },
      }),
    ).toThrow(/Invalid payload/);
    expect(() =>
      parseContract(schemas.cardEntryBulkRequest, {
        path: "a.card.json",
        ids: [0],
        patch: { extensions: {} },
      }),
    ).toThrow(/Invalid payload/);
  });

  it("rejects negative ids and empty id lists", () => {
    expect(() =>
      parseContract(schemas.cardEntryRequest, { path: "a.card.json", id: -1 }),
    ).toThrow(/Invalid payload/);
    expect(() =>
      parseContract(schemas.cardEntryManyRequest, { path: "a.card.json", ids: [] }),
    ).toThrow(/Invalid payload/);
  });

  it("accepts valid responses", () => {
    expect(
      parseContract(schemas.cardMetaResponse, {
        spec: "chara_card_v3",
        name: "x",
        entryCount: 2,
        enabledCount: 1,
        regexCount: 0,
      }),
    ).toBeTruthy();
    expect(
      parseContract(schemas.cardEntryUpdateResponse, { id: 0, changed: ["enabled"] }),
    ).toBeTruthy();
    expect(parseContract(schemas.cardEntryBulkResponse, { count: 3 })).toBeTruthy();
  });
});
