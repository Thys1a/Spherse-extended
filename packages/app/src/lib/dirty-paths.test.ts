import { beforeEach, describe, expect, it } from "vitest";
import { useDirtyPathsStore } from "./dirty-paths";

describe("useDirtyPathsStore remapPaths/removePath", () => {
  beforeEach(() => {
    useDirtyPathsStore.setState({ byProject: {} });
  });

  it("remaps an exact path and its descendants", () => {
    const store = useDirtyPathsStore.getState();
    store.setDirty("p1", "docs/a.md", true);
    store.setDirty("p1", "docs/sub/b.md", true);
    store.setDirty("p1", "other.md", true);

    store.remapPaths("p1", "docs", "notes");

    expect(store.isDirty("p1", "docs/a.md")).toBe(false);
    expect(store.isDirty("p1", "notes/a.md")).toBe(true);
    expect(store.isDirty("p1", "notes/sub/b.md")).toBe(true);
    expect(store.isDirty("p1", "other.md")).toBe(true);
  });

  it("does not match sibling prefixes", () => {
    const store = useDirtyPathsStore.getState();
    store.setDirty("p1", "docs-old/a.md", true);

    store.remapPaths("p1", "docs", "notes");

    expect(store.isDirty("p1", "docs-old/a.md")).toBe(true);
    expect(store.isDirty("p1", "notes-old/a.md")).toBe(false);
  });

  it("is a no-op without matches", () => {
    const store = useDirtyPathsStore.getState();
    store.setDirty("p1", "a.md", true);
    const before = useDirtyPathsStore.getState().byProject;

    store.remapPaths("p1", "missing", "elsewhere");

    expect(useDirtyPathsStore.getState().byProject).toBe(before);
  });

  it("removePath clears a path and its descendants", () => {
    const store = useDirtyPathsStore.getState();
    store.setDirty("p1", "docs", true);
    store.setDirty("p1", "docs/a.md", true);
    store.setDirty("p1", "other.md", true);

    store.removePath("p1", "docs");

    expect(store.isDirtyUnder("p1", "docs")).toBe(false);
    expect(store.isDirty("p1", "other.md")).toBe(true);
  });
});
