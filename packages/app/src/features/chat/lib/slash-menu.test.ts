import { describe, expect, it } from "vitest";
import {
  applySlashPick,
  filterSlashItems,
  matchSlashToken,
  parseSummonMessage,
} from "./slash-menu";

describe("matchSlashToken", () => {
  it("matches only full slash prefixes with kinds", () => {
    expect(matchSlashToken("/") ).toBeNull();
    expect(matchSlashToken("/sk")).toBeNull();
    expect(matchSlashToken("/skill")).toBeNull();
    expect(matchSlashToken("/skill:")?.kinds).toEqual(["skill"]);
    expect(matchSlashToken("/skill:")?.query).toBe("");
    expect(matchSlashToken("/skill:re")?.kinds).toEqual(["skill"]);
    expect(matchSlashToken("/command:te")?.kinds).toEqual(["command"]);
    expect(matchSlashToken("do /skill:re")).toMatchObject({ query: "re", start: 3 });
  });

  it("matches >> agent mentions", () => {
    expect(matchSlashToken(">>bui")).toMatchObject({ query: "bui", kinds: ["agent"] });
  });

  it("returns null for plain text", () => {
    expect(matchSlashToken("hello world")).toBeNull();
    expect(matchSlashToken("/unknown:x")).toBeNull();
    expect(matchSlashToken("a/b")).toBeNull();
    expect(matchSlashToken("/")).toBeNull();
  });
});

describe("filterSlashItems", () => {
  const skills = [{ name: "review" }, { name: "plan" }];
  const commands = [{ name: "test", description: "Run tests" }];
  const agents = [{ name: "build" }, { name: "writer" }];

  it("filters by query across requested kinds", () => {
    const match = matchSlashToken("/skill:e")!;
    expect(filterSlashItems(match, skills, commands, agents).map((i) => i.name)).toEqual([
      "review",
    ]);
  });

  it("limits agent matches", () => {
    const match = matchSlashToken(">>")!;
    expect(filterSlashItems(match, skills, commands, agents).map((i) => i.name)).toEqual([
      "build",
      "writer",
    ]);
  });
});

describe("applySlashPick", () => {
  it("replaces the token and places the cursor after a trailing space", () => {
    const match = matchSlashToken("/skill:re")!;
    expect(
      applySlashPick("/skill:re", match, { kind: "skill", name: "review" }),
    ).toEqual({ text: "/skill:review ", cursor: 14 });
  });

  it("requires the token at the end of the text", () => {
    const match = matchSlashToken("go >>bu now")!;
    expect(match).toBeNull();
  });
});

describe("parseSummonMessage", () => {
  it("parses target slug and message", () => {
    expect(parseSummonMessage(">> build run the tests")).toEqual({
      targetSlug: "build",
      message: "run the tests",
    });
  });

  it("returns null for incomplete invocations", () => {
    expect(parseSummonMessage(">> build")).toBeNull();
    expect(parseSummonMessage("hello")).toBeNull();
  });
});
