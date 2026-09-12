import { act, cleanup, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { createMockHostBridge } from "../../test/host-bridge";
import { createTestQueryClient, renderWithProviders } from "../../test/render";
import { Composer } from "./Composer";
import { useComposerInsertStore } from "./composer-insert-store";
import { compressImage } from "./utils/compress-image";
import type { AttachedFile } from "./types";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const uploadAttachment = vi.fn();
const deleteAttachment = vi.fn();

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => ({
    uploadAttachment,
    deleteAttachment,
    getPreviewUrl: (path: string) => `http://localhost:5173/api/projects/p1/preview/${path}`,
    getSupportedProviders: vi.fn(async () => ({})),
    setSessionModel: vi.fn(),
    listProjectSessions: vi.fn(async () => ({ sessions: [], byAgent: {} })),
    listAgents: vi.fn(async () => []),
  }),
  useConnection: () => ({ baseUrl: "http://localhost:5173", accessToken: null }),
}));

vi.mock("./utils/compress-image", () => ({
  compressImage: vi.fn(),
}));

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

interface ComposerProps {
  streaming?: boolean;
  loading?: boolean;
}

function renderComposer(props: ComposerProps) {
  const onSend = vi.fn(() => true);
  const onAbort = vi.fn();
  const view = renderWithProviders(
    <Composer
      streaming={props.streaming ?? false}
      loading={props.loading ?? false}
      sessionId="session-1"
      onSend={onSend}
      onAbort={onAbort}
    />,
    { queryClient: createTestQueryClient(), bridge: createMockHostBridge() },
  );
  return { onSend, onAbort, view };
}

function rerenderComposer(
  view: ReturnType<typeof renderComposer>["view"],
  props: ComposerProps,
  onSend: (message: string, attachments?: AttachedFile[]) => boolean,
  onAbort: () => void,
) {
  view.rerender(
    <Composer
      streaming={props.streaming ?? false}
      loading={props.loading ?? false}
      sessionId="session-1"
      onSend={onSend}
      onAbort={onAbort}
    />,
  );
}

function mockPointerCoarse(matches: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(((query: string) => ({
    matches: query.includes("coarse") && matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia);
}

describe("Composer input availability", () => {
  it("keeps the textarea enabled while the agent is streaming", () => {
    renderComposer({ streaming: true });
    expect(screen.getByRole("textbox")).toBeEnabled();
  });

  it("accepts typed text while streaming and preserves it as a draft", async () => {
    const { view, onSend, onAbort } = renderComposer({ streaming: true });
    await user.type(screen.getByRole("textbox"), "继续执行");
    expect(screen.getByRole("textbox")).toHaveValue("继续执行");

    rerenderComposer(view, { streaming: false }, onSend, onAbort);
    expect(screen.getByRole("textbox")).toHaveValue("继续执行");
  });

  it("does not send the draft on Enter while streaming", async () => {
    const { onSend } = renderComposer({ streaming: true });
    await user.type(screen.getByRole("textbox"), "流式期间输入{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends the draft typed during streaming once streaming ends", async () => {
    const { onSend, onAbort, view } = renderComposer({ streaming: true });
    await user.type(screen.getByRole("textbox"), "流式期间输入");

    rerenderComposer(view, { streaming: false }, onSend, onAbort);
    expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(onSend).toHaveBeenCalledWith("流式期间输入", undefined);
  });

  it("swaps the send button for the abort button while streaming and aborts on click", async () => {
    const { onAbort } = renderComposer({ streaming: true });
    expect(screen.queryByRole("button", { name: "发送" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "停止" }));
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it("still disables the textarea while session history is loading", () => {
    renderComposer({ loading: true });
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("keeps the textarea disabled when streaming and loading are both true", () => {
    renderComposer({ streaming: true, loading: true });
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});

describe("Composer enter key behavior", () => {
  it("sends the draft on Enter with a fine pointer", async () => {
    mockPointerCoarse(false);
    const { onSend } = renderComposer({ streaming: false });
    await user.type(screen.getByRole("textbox"), "hello world{Enter}");
    expect(onSend).toHaveBeenCalledWith("hello world", undefined);
    expect(screen.getByRole("textbox")).toHaveAttribute("enterkeyhint", "send");
  });

  it("inserts a newline instead of sending on touch keyboards", async () => {
    mockPointerCoarse(true);
    const { onSend } = renderComposer({ streaming: false });
    await user.type(screen.getByRole("textbox"), "第一行{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("第一行\n");
    expect(screen.getByRole("textbox")).toHaveAttribute("enterkeyhint", "enter");
  });

  it("still sends from the send button on touch keyboards", async () => {
    mockPointerCoarse(true);
    const { onSend } = renderComposer({ streaming: false });
    await user.type(screen.getByRole("textbox"), "touch draft");
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(onSend).toHaveBeenCalledWith("touch draft", undefined);
  });
});

describe("Composer attachment pipeline", () => {
  function hiddenFileInput(): HTMLInputElement {
    const input = document.querySelector('input[type="file"]');
    if (!input) throw new Error("file input not found");
    return input as HTMLInputElement;
  }

  beforeEach(() => {
    vi.mocked(compressImage).mockReset();
    uploadAttachment.mockReset();
    deleteAttachment.mockReset().mockResolvedValue(undefined);
    vi.mocked(toast.error).mockClear();
  });

  it("runs the compress -> upload pipeline, disables send while busy and passes the image through onSend", async () => {
    let releaseCompress!: (value: { blob: Blob; width: number; height: number; mimeType: "image/jpeg" }) => void;
    vi.mocked(compressImage).mockImplementation(
      () => new Promise((resolve) => (releaseCompress = resolve)),
    );
    uploadAttachment.mockResolvedValue({ path: "attachments/img-1.jpg", bytes: 10 });

    const { onSend } = renderComposer({ streaming: false });
    await user.type(screen.getByRole("textbox"), "with picture");

    const file = new File(["raw"], "pic.png", { type: "image/png" });
    await user.upload(hiddenFileInput(), file);

    expect(compressImage).toHaveBeenCalledWith(file);
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "移除图片" })).not.toBeInTheDocument();

    releaseCompress({ blob: new Blob(["compressed"]), width: 800, height: 600, mimeType: "image/jpeg" });
    await screen.findByRole("button", { name: "移除图片" });

    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(uploadAttachment).toHaveBeenCalledWith(expect.any(Blob), {
      filename: "pic.png",
      width: 800,
      height: 600,
    });
    expect(onSend).toHaveBeenCalledWith(
      "with picture",
      [expect.objectContaining({ path: "attachments/img-1.jpg", mimeType: "image/jpeg" })],
    );
  });

  it("uploads text files without compression", async () => {
    uploadAttachment.mockResolvedValue({ path: "attachments/note.txt", bytes: 5 });

    const { onSend } = renderComposer({ streaming: false });
    await user.type(screen.getByRole("textbox"), "read this");

    await user.upload(hiddenFileInput(), new File(["hello"], "note.txt", { type: "text/plain" }));
    await screen.findByText("note.txt");

    expect(compressImage).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(uploadAttachment).toHaveBeenCalledWith(expect.any(File), { filename: "note.txt" });
    expect(onSend).toHaveBeenCalledWith(
      "read this",
      [expect.objectContaining({ path: "attachments/note.txt", mimeType: "text/plain", name: "note.txt" })],
    );
  });

  it("keeps successful uploads when one file fails", async () => {
    uploadAttachment.mockImplementation(async (blob: Blob, opts?: { filename?: string }) => {
      if (opts?.filename === "bad.txt") throw new Error("rejected");
      return { path: `attachments/${opts?.filename}`, bytes: 3 };
    });

    renderComposer({ streaming: false });
    await user.upload(
      hiddenFileInput(),
      [new File(["ok"], "good.txt", { type: "text/plain" }), new File(["no"], "bad.txt", { type: "text/plain" })],
    );
    await screen.findByText("good.txt");

    expect(screen.queryByText("bad.txt")).not.toBeInTheDocument();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls.at(-1)![0]).toContain("bad.txt");
  });

  it("deletes the uploaded attachment on remove", async () => {
    vi.mocked(compressImage).mockResolvedValue({ blob: new Blob(["c"]), width: 10, height: 10, mimeType: "image/jpeg" });
    uploadAttachment.mockResolvedValue({ path: "attachments/img-2.jpg", bytes: 3 });

    renderComposer({ streaming: false });
    await user.upload(hiddenFileInput(), new File(["x"], "p.png", { type: "image/png" }));
    await screen.findByRole("button", { name: "移除图片" });

    await user.click(screen.getByRole("button", { name: "移除图片" }));

    expect(deleteAttachment).toHaveBeenCalledWith("attachments/img-2.jpg");
    expect(screen.queryByRole("button", { name: "移除图片" })).not.toBeInTheDocument();
  });

  it("surfaces attach failures via the i18n toast and recovers", async () => {
    vi.mocked(compressImage).mockRejectedValue(new Error("too large"));
    const { onSend } = renderComposer({ streaming: false });
    await user.type(screen.getByRole("textbox"), "draft");

    await user.upload(hiddenFileInput(), new File(["x"], "p.png", { type: "image/png" }));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls.at(-1)![0]).toContain("p.png");
    expect(uploadAttachment).not.toHaveBeenCalled();

    expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(onSend).toHaveBeenCalledWith("draft", undefined);
  });
});

describe("Composer external insert", () => {
  it("inserts quoted text at the cursor when another component requests it", async () => {
    renderComposer({ streaming: false });
    await user.type(screen.getByRole("textbox"), "hello");

    act(() => {
      useComposerInsertStore.getState().requestInsert("session-1", "```quoted\nworld\n```");
    });
    await vi.waitFor(() => {
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain(
        "hello\n```quoted\nworld\n```",
      );
    });
    useComposerInsertStore.setState({ sessionId: null, text: "", nonce: 0 });
  });

  it("ignores insert requests for other sessions", async () => {
    renderComposer({ streaming: false });
    act(() => {
      useComposerInsertStore.getState().requestInsert("other-session", "```quoted\nx\n```");
    });

    expect(screen.getByRole("textbox")).toHaveValue("");
    useComposerInsertStore.setState({ sessionId: null, text: "", nonce: 0 });
  });

  it("does not replay a consumed insert on remount", async () => {
    const first = renderComposer({ streaming: false });
    act(() => {
      useComposerInsertStore.getState().requestInsert("session-1", "```quoted\nonce\n```");
    });
    await vi.waitFor(() => {
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("once");
    });
    first.view.unmount();
    localStorage.clear();

    renderComposer({ streaming: false });
    expect(screen.getByRole("textbox")).toHaveValue("");
    useComposerInsertStore.setState({ sessionId: null, text: "", nonce: 0 });
  });
});
