import { beforeEach, describe, expect, it } from "vitest";
import { useSplitStore } from "./split-store";

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
});
