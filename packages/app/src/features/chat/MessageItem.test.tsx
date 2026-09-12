import { cleanup, fireEvent, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentSummary } from "../../lib/types";
import { createMockHostBridge } from "../../test/host-bridge";
import { renderWithProviders } from "../../test/render";
import { MessageItem } from "./MessageItem";
import { quoteFenceFor } from "./lib/quote-fence";
import { useComposerInsertStore } from "./composer-insert-store";
import type { ChatMessage } from "./types";

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => ({
    getPreviewUrl: (path: string) => `http://localhost:5173/api/projects/p1/preview/${path}`,
  }),
  useConnection: () => ({ baseUrl: "http://localhost:5173", accessToken: null }),
}));

const agent = { id: "a1", name: "Helper", alias: "" } as unknown as AgentSummary;

function renderMessage(
  message: Partial<ChatMessage> & { role: "user" | "assistant" },
  props: { onWithdraw?: () => void } = {},
) {
  renderWithProviders(
    <MessageItem message={{ content: "hello", ...message } as ChatMessage} agent={agent} onWithdraw={props.onWithdraw} />,
    { bridge: createMockHostBridge() },
  );
}

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
  useComposerInsertStore.setState({ sessionId: null, text: "", nonce: 0 });
  vi.restoreAllMocks();
  if (originalClipboard === undefined) {
    Reflect.deleteProperty(navigator, "clipboard");
  } else {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  }
});

describe("MessageItem withdraw action", () => {
  it("renders a withdraw action for user messages when onWithdraw is provided", async () => {
    const user = userEvent.setup();
    const onWithdraw = vi.fn();
    renderMessage({ role: "user" }, { onWithdraw });

    await user.click(screen.getByRole("button", { name: "撤回" }));
    await user.click(screen.getByRole("button", { name: "确认撤回" }));
    expect(onWithdraw).toHaveBeenCalledTimes(1);
  });

  it("omits the withdraw action for assistant messages", () => {
    renderMessage({ role: "assistant" });
    expect(screen.queryByRole("button", { name: "撤回" })).not.toBeInTheDocument();
  });

  it("omits the withdraw action while streaming", () => {
    renderMessage({ role: "user", _streaming: true } as never);
    expect(screen.queryByRole("button", { name: "撤回" })).not.toBeInTheDocument();
  });
});

describe("MessageItem user attachments", () => {
  it("renders image attachments through the preview url and zooms via a body portal", async () => {
    const user = userEvent.setup();
    renderMessage({
      role: "user",
      content: "look at this",
      _attachments: [{ type: "image", path: "uploads/pic.png", name: "pic.png" }] as never,
    });
    const thumbnail = document.querySelector<HTMLImageElement>('img[src$="uploads/pic.png"]');
    expect(thumbnail).not.toBeNull();
    expect(thumbnail!.src).toBe("http://localhost:5173/api/projects/p1/preview/uploads/pic.png");

    await user.click(thumbnail!.closest("button")!);
    const dialog = screen.getByRole("dialog");
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.querySelector('img[src$="uploads/pic.png"]')).not.toBeNull();
  });

  it("renders no attachment block when the list is empty", () => {
    renderMessage({ role: "user", _attachments: [] as never });
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("MessageItem bubble links", () => {
  it("opens external links through the shared link resolver instead of navigating", async () => {
    const user = userEvent.setup();
    const openExternal = vi.fn(async () => {});
    renderWithProviders(
      <MessageItem message={{ role: "assistant", content: "[docs](https://example.com/x)" } as ChatMessage} agent={agent} />,
      { bridge: createMockHostBridge({ openExternal }) },
    );

    await user.click(screen.getByRole("link", { name: "docs" }));
    expect(openExternal).toHaveBeenCalledWith("https://example.com/x");
  });

  it("keeps in-page anchors inside the chat instead of forwarding to the browser", async () => {
    const user = userEvent.setup();
    const openExternal = vi.fn(async () => {});
    renderWithProviders(
      <MessageItem message={{ role: "assistant", content: "[jump](#section)" } as ChatMessage} agent={agent} />,
      { bridge: createMockHostBridge({ openExternal }) },
    );

    await user.click(screen.getByRole("link", { name: "jump" }));
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe("MessageItem selection menu", () => {
  function renderWithSelection(content: string, sessionId = "session-1") {
    renderWithProviders(
      <MessageItem
        message={{ role: "assistant", content } as ChatMessage}
        agent={agent}
        sessionId={sessionId}
      />,
      { bridge: createMockHostBridge() },
    );
    const bubble = document.querySelector("[data-chat-bubble]")!;
    window.getSelection()?.selectAllChildren(bubble);
    fireEvent.contextMenu(bubble, { clientX: 50, clientY: 60 });
  }

  it("shows copy and quote items when right-clicking a non-empty selection", () => {
    renderWithSelection("selectable text");
    expect(screen.getByRole("menuitem", { name: "复制选区" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "引用到当前会话" })).toBeInTheDocument();
  });

  it("does not show the menu without a selection", () => {
    renderWithProviders(
      <MessageItem message={{ role: "assistant", content: "plain" } as ChatMessage} agent={agent} />,
      { bridge: createMockHostBridge() },
    );
    fireEvent.contextMenu(document.querySelector("[data-chat-bubble]")!);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("copies the selected text to the clipboard", async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderWithSelection("copy me");
    fireEvent.click(screen.getByRole("menuitem", { name: "复制选区" }));
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("copy me"));
    });
  });

  it("requests a composer insert with a quoted block", async () => {
    const user = userEvent.setup();
    renderWithSelection("quote me", "session-9");
    await user.click(screen.getByRole("menuitem", { name: "引用到当前会话" }));
    const state = useComposerInsertStore.getState();
    expect(state.sessionId).toBe("session-9");
    expect(state.text).toContain("```quoted");
    expect(state.text).toContain("quote me");
    useComposerInsertStore.setState({ sessionId: null, text: "", nonce: 0 });
  });

  it("hides the quote item when sessionId is missing", () => {
    renderWithProviders(
      <MessageItem message={{ role: "assistant", content: "no session" } as ChatMessage} agent={agent} />,
      { bridge: createMockHostBridge() },
    );
    const bubble = document.querySelector("[data-chat-bubble]")!;
    window.getSelection()?.selectAllChildren(bubble);
    fireEvent.contextMenu(bubble);
    expect(screen.getByRole("menuitem", { name: "复制选区" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "引用到当前会话" })).not.toBeInTheDocument();
  });

  it("extends the fence when the selection contains triple backticks", async () => {
    const user = userEvent.setup();
    renderWithSelection("quote me", "session-9");
    await user.click(screen.getByRole("menuitem", { name: "引用到当前会话" }));
    expect(useComposerInsertStore.getState().text).toContain("```quoted");
    useComposerInsertStore.setState({ sessionId: null, text: "", nonce: 0 });
  });

  it("quoteFenceFor lengthens the fence past backticks in the text", () => {
    expect(quoteFenceFor("plain")).toBe("```");
    expect(quoteFenceFor("code ```x``` end")).toBe("````");
  });
});

describe("MessageItem edit and resend", () => {
  function renderEditable(content = "original") {
    renderWithProviders(
      <MessageItem
        message={{ role: "user", content } as ChatMessage}
        agent={agent}
        sessionId="session-1"
        editable
      />,
      { bridge: createMockHostBridge() },
    );
  }

  it("shows an edit button for editable user messages", () => {
    renderEditable();
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();
  });

  it("hides the edit button without sessionId", () => {
    renderWithProviders(
      <MessageItem message={{ role: "user", content: "x" } as ChatMessage} agent={agent} editable />,
      { bridge: createMockHostBridge() },
    );
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
  });

  it("opens an editor prefilled with the message and resends on confirm", async () => {
    const user = userEvent.setup();
    const editAndResend = vi.fn();
    renderEditable();
    await user.click(screen.getByRole("button", { name: "编辑" }));

    const editor = screen.getByRole("textbox");
    expect(editor).toHaveValue("original");

    const store = await import("./runtime/streaming-store");
    const spy = vi.spyOn(store.useStreamingStore.getState(), "editAndResend").mockImplementation(editAndResend);
    await user.clear(editor);
    await user.type(editor, "edited");
    await user.click(screen.getByRole("button", { name: "重新发送" }));
    expect(editAndResend).toHaveBeenCalledWith("session-1", "edited");
    spy.mockRestore();
  });

  it("closes the editor on cancel without resending", async () => {
    const user = userEvent.setup();
    renderEditable();
    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
