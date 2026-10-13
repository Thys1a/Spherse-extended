import { beforeEach, describe, expect, it, vi } from "vitest";
import { clampRatioForWidth, useSplitStore } from "./split-store";

describe("useSplitStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useSplitStore.setState({ byProject: {} });
  });

  it("opens a split with the default ratio", () => {
    useSplitStore.getState().openSplit("p1", "a.md");

    expect(useSplitStore.getState().byProject["p1"]).toEqual({ filePath: "a.md", ratio: 0.5 });
  });

  it("is a no-op when opening the same file", () => {
    useSplitStore.getState().openSplit("p1", "a.md");
    const before = useSplitStore.getState().byProject;

    useSplitStore.getState().openSplit("p1", "a.md");

    expect(useSplitStore.getState().byProject).toBe(before);
  });

  it("replaces the file but keeps the ratio", () => {
    useSplitStore.getState().openSplit("p1", "a.md");
    useSplitStore.getState().setRatio("p1", 0.6);
    useSplitStore.getState().openSplit("p1", "b.md");

    expect(useSplitStore.getState().byProject["p1"]).toEqual({ filePath: "b.md", ratio: 0.6 });
  });

  it("setFile is a no-op without an open split", () => {
    useSplitStore.getState().setFile("p1", "a.md");

    expect(useSplitStore.getState().byProject["p1"]).toBeUndefined();
  });

  it("clamps the ratio into range", () => {
    useSplitStore.getState().openSplit("p1", "a.md");
    useSplitStore.getState().setRatio("p1", 0.95);
    expect(useSplitStore.getState().byProject["p1"]?.ratio).toBe(0.8);

    useSplitStore.getState().setRatio("p1", 0.05);
    expect(useSplitStore.getState().byProject["p1"]?.ratio).toBe(0.2);
  });

  it("closes the split and clears the project", () => {
    useSplitStore.getState().openSplit("p1", "a.md");
    useSplitStore.getState().closeSplit("p1");

    expect(useSplitStore.getState().byProject["p1"]).toBeUndefined();
  });

  it("persists the split to storage", () => {
    useSplitStore.getState().openSplit("p1", "a.md");

    const raw = localStorage.getItem("spherse:split");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({ p1: { filePath: "a.md", ratio: 0.5 } });
  });

  it("clearProject removes the split", () => {
    useSplitStore.getState().openSplit("p1", "a.md");
    useSplitStore.getState().clearProject("p1");

    expect(useSplitStore.getState().byProject["p1"]).toBeUndefined();
  });

  it("ignores empty file paths", () => {
    useSplitStore.getState().openSplit("p1", "");
    useSplitStore.getState().setFile("p1", "");

    expect(useSplitStore.getState().byProject["p1"]).toBeUndefined();
    expect(localStorage.getItem("spherse:split")).toBeNull();
  });

  it("setRatio is a no-op without an open split", () => {
    const before = useSplitStore.getState().byProject;
    useSplitStore.getState().setRatio("p1", 0.6);

    expect(useSplitStore.getState().byProject).toBe(before);
  });

  it("closeDeletedSplit closes the split when its file is deleted", () => {
    useSplitStore.getState().openSplit("p1", "docs/a.md");

    useSplitStore.getState().closeDeletedSplit("p1", "docs/a.md");

    expect(useSplitStore.getState().byProject["p1"]).toBeUndefined();
  });

  it("closeDeletedSplit closes the split when its parent directory is deleted", () => {
    useSplitStore.getState().openSplit("p1", "docs/a.md");

    useSplitStore.getState().closeDeletedSplit("p1", "docs");

    expect(useSplitStore.getState().byProject["p1"]).toBeUndefined();
  });

  it("closeDeletedSplit keeps the split for unrelated paths", () => {
    useSplitStore.getState().openSplit("p1", "docs/a.md");
    const before = useSplitStore.getState().byProject;

    useSplitStore.getState().closeDeletedSplit("p1", "other.md");
    useSplitStore.getState().closeDeletedSplit("p1", "docs-extra");

    expect(useSplitStore.getState().byProject).toBe(before);
  });

  it("closeDeletedSplit is a no-op without an open split", () => {
    const before = useSplitStore.getState().byProject;

    useSplitStore.getState().closeDeletedSplit("p1", "a.md");

    expect(useSplitStore.getState().byProject).toBe(before);
  });

  it("remapSplit follows renames of the open file", () => {
    useSplitStore.getState().openSplit("p1", "docs/a.md");

    useSplitStore.getState().remapSplit("p1", "docs/a.md", "notes/a.md");

    expect(useSplitStore.getState().byProject["p1"]).toMatchObject({ filePath: "notes/a.md", ratio: 0.5 });
  });

  it("remapSplit follows renames of a parent directory", () => {
    useSplitStore.getState().openSplit("p1", "docs/sub/a.md");

    useSplitStore.getState().remapSplit("p1", "docs", "notes");

    expect(useSplitStore.getState().byProject["p1"]).toMatchObject({ filePath: "notes/sub/a.md" });
  });

  it("remapSplit ignores unrelated paths", () => {
    useSplitStore.getState().openSplit("p1", "docs/a.md");
    const before = useSplitStore.getState().byProject;

    useSplitStore.getState().remapSplit("p1", "other", "new");
    useSplitStore.getState().remapSplit("p1", "docs-extra", "new");

    expect(useSplitStore.getState().byProject).toBe(before);
  });
});

describe("clampRatioForWidth", () => {
  it("falls back to fixed bounds without a measurable container", () => {
    expect(clampRatioForWidth(0.9, 0)).toBe(0.8);
    expect(clampRatioForWidth(0.1, Number.NaN)).toBe(0.2);
  });

  it("keeps fixed bounds on wide containers", () => {
    expect(clampRatioForWidth(0.6, 1000)).toBe(0.6);
    expect(clampRatioForWidth(0.9, 1000)).toBe(0.8);
  });

  it("snaps back to the default ratio on narrow containers", () => {
    expect(clampRatioForWidth(0.6, 700)).toBe(0.5);
    expect(clampRatioForWidth(0.2, 320)).toBe(0.5);
  });

  it("holds the default ratio at the narrow-width boundary", () => {
    expect(clampRatioForWidth(0.6, 719)).toBe(0.5);
    expect(clampRatioForWidth(0.9, 720)).toBe(0.8);
    expect(clampRatioForWidth(0.6, -100)).toBe(0.6);
  });
});

describe("useSplitStore storage recovery", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("recovers from corrupt JSON", async () => {
    localStorage.setItem("spherse:split", "{invalid");
    vi.resetModules();
    const mod = await import("./split-store");

    expect(mod.useSplitStore.getState().byProject).toEqual({});
  });

  it("drops invalid entries and clamps out-of-range ratios", async () => {
    localStorage.setItem(
      "spherse:split",
      JSON.stringify({ p1: { filePath: "a.md", ratio: 0.99 }, bad: { nope: 1 }, empty: { filePath: "", ratio: 0.5 } }),
    );
    vi.resetModules();
    const mod = await import("./split-store");

    expect(mod.useSplitStore.getState().byProject).toEqual({ p1: { filePath: "a.md", ratio: 0.8 } });
  });
});
