import { useEffect } from "react";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import type { ApiClient } from "../../../lib/api";
import { useDirtyPathsStore } from "../../../lib/dirty-paths";
import { useTabStore } from "../../../features/tabs/tab-store";
import { useFileTreeController, type FileTreeController } from "./useFileTreeController";

function Harness({
  client,
  onDeleted,
  onRenamed,
  onApi,
}: {
  client: ApiClient;
  onDeleted?: (paths: string[]) => void;
  onRenamed?: (oldPath: string, newPath: string) => void;
  onApi: (api: FileTreeController) => void;
}) {
  const api = useFileTreeController(client, onDeleted, "p1", onRenamed);
  useEffect(() => {
    onApi(api);
  });
  return null;
}

function renderController(
  client: ApiClient,
  options: { onDeleted?: (paths: string[]) => void; onRenamed?: (oldPath: string, newPath: string) => void } = {},
) {
  let api: FileTreeController | null = null;
  renderWithProviders(
    <Harness client={client} onDeleted={options.onDeleted} onRenamed={options.onRenamed} onApi={(a) => (api = a)} />,
  );
  return {
    api: () => {
      if (!api) throw new Error("api not captured");
      return api;
    },
  };
}

function mockClient(): ApiClient & {
  moveContent: ReturnType<typeof vi.fn>;
  deleteContent: ReturnType<typeof vi.fn>;
} {
  return {
    moveContent: vi.fn().mockResolvedValue({ ok: true }),
    deleteContent: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as ApiClient & {
    moveContent: ReturnType<typeof vi.fn>;
    deleteContent: ReturnType<typeof vi.fn>;
  };
}

describe("useFileTreeController submitMove", () => {
  beforeEach(() => {
    useTabStore.setState({ byProject: {} });
    useDirtyPathsStore.setState({ byProject: {} });
  });

  it("moves and notifies with remapped paths", async () => {
    const client = mockClient();
    const onRenamed = vi.fn();
    const { api } = renderController(client, { onRenamed });

    let moved = false;
    await act(async () => {
      moved = await api().submitMove("a.md", "docs/a.md");
    });

    expect(moved).toBe(true);
    expect(client.moveContent).toHaveBeenCalledWith("a.md", "docs/a.md");
    expect(onRenamed).toHaveBeenCalledWith("a.md", "docs/a.md");
  });

  it("reports failure without notifying", async () => {
    const client = mockClient();
    client.moveContent.mockRejectedValueOnce(new Error("denied"));
    const onRenamed = vi.fn();
    const { api } = renderController(client, { onRenamed });

    let moved = true;
    await act(async () => {
      moved = await api().submitMove("a.md", "docs/a.md");
    });

    expect(moved).toBe(false);
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it("blocks moves of dirty paths", async () => {
    const client = mockClient();
    useDirtyPathsStore.getState().setDirty("p1", "a.md", "test-instance", true);
    const { api } = renderController(client);

    let moved = true;
    await act(async () => {
      moved = await api().submitMove("a.md", "docs/a.md");
    });

    expect(moved).toBe(false);
    expect(client.moveContent).not.toHaveBeenCalled();
  });

  it("remaps dirty paths flagged while a move is in flight", async () => {
    const client = mockClient();
    let resolveMove!: (value: { ok: boolean }) => void;
    client.moveContent.mockImplementationOnce(
      () => new Promise<{ ok: boolean }>((resolve) => { resolveMove = resolve; }),
    );
    const { api } = renderController(client);

    let moved = false;
    const pending = api().submitMove("docs", "notes").then((result) => { moved = result; });
    useDirtyPathsStore.getState().setDirty("p1", "docs/a.md", "test-instance", true);
    resolveMove({ ok: true });
    await act(async () => { await pending; });

    expect(moved).toBe(true);
    expect(useDirtyPathsStore.getState().isDirty("p1", "docs/a.md")).toBe(false);
    expect(useDirtyPathsStore.getState().isDirty("p1", "notes/a.md")).toBe(true);
  });
});

describe("useFileTreeController confirmDelete", () => {
  beforeEach(() => {
    useTabStore.setState({ byProject: {} });
    useDirtyPathsStore.setState({ byProject: {} });
  });

  it("deletes a single target and notifies with an array", async () => {
    const client = mockClient();
    const onDeleted = vi.fn();
    const { api } = renderController(client, { onDeleted });

    act(() => {
      api().requestDelete({ name: "a.md", path: "a.md", type: "file" });
    });
    act(() => {
      api().confirmDelete();
    });

    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith(["a.md"]));
    expect(client.deleteContent).toHaveBeenCalledTimes(1);
    expect(client.deleteContent).toHaveBeenCalledWith("a.md");
  });

  it("deletes many targets and notifies only with succeeded paths", async () => {
    const client = mockClient();
    client.deleteContent.mockRejectedValueOnce(new Error("denied"));
    const onDeleted = vi.fn();
    const { api } = renderController(client, { onDeleted });

    act(() => {
      api().requestDeleteMany(["a.md", "b.md"]);
    });
    act(() => {
      api().confirmDelete();
    });

    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith(["b.md"]));
    expect(client.deleteContent).toHaveBeenCalledTimes(2);
  });

  it("clears dirty paths of deleted targets", async () => {
    const client = mockClient();
    useDirtyPathsStore.getState().setDirty("p1", "dir/b.md", "test-instance", true);
    useDirtyPathsStore.getState().setDirty("p1", "other.md", "test-instance", true);
    const onDeleted = vi.fn();
    const { api } = renderController(client, { onDeleted });

    act(() => {
      api().requestDelete({ name: "dir", path: "dir", type: "directory" });
    });
    act(() => {
      api().confirmDelete();
    });

    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith(["dir"]));
    expect(useDirtyPathsStore.getState().isDirty("p1", "dir/b.md")).toBe(false);
    expect(useDirtyPathsStore.getState().isDirty("p1", "other.md")).toBe(true);
  });

  it("does nothing without targets", async () => {
    const client = mockClient();
    const onDeleted = vi.fn();
    const { api } = renderController(client, { onDeleted });

    act(() => {
      api().confirmDelete();
    });

    expect(client.deleteContent).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
