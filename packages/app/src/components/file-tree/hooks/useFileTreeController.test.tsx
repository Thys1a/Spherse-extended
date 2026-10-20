import { useEffect } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { I18nProvider } from "@spherse/i18n/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import type { ApiClient } from "../../../lib/api";
import { invalidateProjectFileQueries } from "../../../queries/content";
import { useDirtyPathsStore } from "../../../lib/dirty-paths";
import { useTabStore } from "../../../features/tabs/tab-store";
import { useFileTreeController, type FileTreeController } from "./useFileTreeController";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock("../../../queries/content", () => ({
  invalidateProjectFileQueries: vi.fn(async () => {}),
}));

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

function makeFile(name: string): File {
  return new File(["content"], name, { type: "text/plain" });
}

function setup() {
  const uploadFile = vi.fn<(dir: string, file: File) => Promise<{ path: string; bytes: number; renamed: boolean }>>();
  const client = { uploadFile } as unknown as ApiClient;
  const utils = renderHook(() => useFileTreeController(client, undefined, "p1"), {
    wrapper: ({ children }) => <I18nProvider locale="zh-CN">{children}</I18nProvider>,
  });
  return { uploadFile, ...utils };
}

describe("useFileTreeController uploadFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads every file to the target dir, invalidates queries, and expands the dir", async () => {
    const { result, uploadFile } = setup();
    uploadFile.mockImplementation(async (_dir, file) => ({
      path: `docs/${file.name}`,
      bytes: file.size,
      renamed: false,
    }));
    const a = makeFile("a.txt");
    const b = makeFile("b.md");

    await act(async () => {
      await result.current.uploadFiles("docs", [a, b]);
    });

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(uploadFile).toHaveBeenNthCalledWith(1, "docs", a);
    expect(uploadFile).toHaveBeenNthCalledWith(2, "docs", b);
    expect(invalidateProjectFileQueries).toHaveBeenCalledWith("p1", "docs/a.txt");
    expect(invalidateProjectFileQueries).toHaveBeenCalledWith("p1", "docs/b.md");
    expect(toast.success).toHaveBeenCalledWith("已上传 2 个文件");
    expect(toast.info).not.toHaveBeenCalled();
    expect(result.current.expandedPaths.has("docs")).toBe(true);
  });

  it("reports server-side renames", async () => {
    const { result, uploadFile } = setup();
    uploadFile.mockResolvedValueOnce({ path: "note (1).txt", bytes: 1, renamed: true });
    await act(async () => {
      await result.current.uploadFiles("", [makeFile("note.txt")]);
    });
    expect(toast.info).toHaveBeenCalledWith("同名文件已自动重命名：note (1).txt");
  });

  it("continues after a failed upload and only invalidates successes", async () => {
    const { result, uploadFile } = setup();
    uploadFile.mockRejectedValueOnce(new Error("boom"));
    uploadFile.mockResolvedValueOnce({ path: "docs/ok.txt", bytes: 1, renamed: false });

    await act(async () => {
      await result.current.uploadFiles("docs", [makeFile("bad.txt"), makeFile("ok.txt")]);
    });

    expect(toast.error).toHaveBeenCalledWith("上传失败：boom");
    expect(invalidateProjectFileQueries).toHaveBeenCalledTimes(1);
    expect(invalidateProjectFileQueries).toHaveBeenCalledWith("p1", "docs/ok.txt");
    expect(toast.success).toHaveBeenCalledWith("已上传 1 个文件");
    await waitFor(() => expect(result.current.expandedPaths.has("docs")).toBe(true));
  });

  it("shows a hint and does nothing else for an empty file list", async () => {
    const { result, uploadFile } = setup();
    await act(async () => {
      await result.current.uploadFiles("docs", []);
    });
    expect(uploadFile).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith("仅支持拖入文件，文件夹将被忽略");
  });
});
