import { describe, expect, it } from "vitest";
import { parseContract, schemas } from "../index.js";

describe("data query contracts", () => {
  it("accepts valid query requests and responses", () => {
    expect(
      parseContract(schemas.dataQueryRequest, {
        file: "world/board.data.json",
        name: "listTodos",
        params: { status: "pending" },
        limit: 10,
      }),
    ).toEqual({
      file: "world/board.data.json",
      name: "listTodos",
      params: { status: "pending" },
      limit: 10,
    });
    expect(
      parseContract(schemas.dataQueryResponse, {
        version: "abc123",
        value: [{ id: "a" }],
        total: 1,
        count: 1,
        pagination: "cursor",
        nextAfter: "cursor:1",
      }),
    ).toEqual({
      version: "abc123",
      value: [{ id: "a" }],
      total: 1,
      count: 1,
      pagination: "cursor",
      nextAfter: "cursor:1",
    });
  });

  it("rejects missing name and out-of-range limit", () => {
    expect(() => parseContract(schemas.dataQueryRequest, { file: "world/board.data.json" })).toThrow(
      /Invalid payload/,
    );
    expect(() =>
      parseContract(schemas.dataQueryRequest, { file: "world/board.data.json", name: "q", limit: 0 }),
    ).toThrow(/Invalid payload/);
    expect(() =>
      parseContract(schemas.dataQueryRequest, { file: "world/board.data.json", name: "q", limit: 101 }),
    ).toThrow(/Invalid payload/);
    expect(() =>
      parseContract(schemas.dataQueryRequest, { file: "world/board.data.json", name: "q", after: "" }),
    ).toThrow(/Invalid payload/);
  });
});
