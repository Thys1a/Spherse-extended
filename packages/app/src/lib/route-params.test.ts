import { describe, expect, it } from "vitest";
import { isIndexRoute } from "./route-params";

describe("isIndexRoute", () => {
  it("matches the bare index route and deep links with query params", () => {
    expect(isIndexRoute("/")).toBe(true);
    expect(isIndexRoute("/?base=wss://x&token=y")).toBe(true);
  });

  it("rejects project and other routes", () => {
    expect(isIndexRoute("/project/p1")).toBe(false);
    expect(isIndexRoute("")).toBe(false);
  });
});
