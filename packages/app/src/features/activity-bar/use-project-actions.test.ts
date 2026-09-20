import { describe, expect, it } from "vitest";
import { buildProjectRoute } from "./use-project-actions";

describe("buildProjectRoute", () => {
  it("returns the project index without a last route", () => {
    expect(buildProjectRoute("p1")).toBe("/project/p1");
    expect(buildProjectRoute("p1", "")).toBe("/project/p1");
    expect(buildProjectRoute("p1", "/")).toBe("/project/p1");
  });

  it("restores valid last routes", () => {
    expect(buildProjectRoute("p1", "/chat/s1")).toBe("/project/p1/chat/s1");
    expect(buildProjectRoute("p1", "/content?path=a.md")).toBe("/project/p1/content?path=a.md");
  });

  it("falls back to the project index for invalid last routes", () => {
    expect(buildProjectRoute("p1", "/unknown")).toBe("/project/p1");
    expect(buildProjectRoute("p1", "/content")).toBe("/project/p1");
    expect(buildProjectRoute("p1", "chat/s1")).toBe("/project/p1");
    expect(buildProjectRoute("p1", "/project/p1/chat/s1")).toBe("/project/p1");
  });
});
