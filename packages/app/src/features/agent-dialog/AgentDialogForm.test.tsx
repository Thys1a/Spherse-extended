import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { createMockHostBridge } from "../../test/host-bridge";
import { createTestQueryClient, renderWithProviders } from "../../test/render";
import { AgentDialogForm } from "./AgentDialogForm";

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => ({
    getSupportedProviders: vi.fn(async () => ({})),
    listAgents: vi.fn(async () => []),
  }),
  useConnection: () => ({ baseUrl: "http://localhost:5173", accessToken: null }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const RAW = [
  "---",
  "name: Helper",
  "placeholder: 输入消息…",
  "greeting: 你好，我是小助手",
  "---",
  "",
  "system prompt",
].join("\n");

function renderForm(
  onSubmit = vi.fn(async (_slug: string, _content: string, _theme: string) => {}),
) {
  renderWithProviders(
    <AgentDialogForm
      initial={{ raw: RAW, theme: "" }}
      mode="edit"
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
    { queryClient: createTestQueryClient(), bridge: createMockHostBridge() },
  );
  return onSubmit;
}

describe("AgentDialogForm placeholder/greeting (R4.2)", () => {
  it("loads placeholder and greeting from frontmatter", () => {
    renderForm();
    expect(screen.getByDisplayValue("输入消息…")).not.toBeNull();
    expect(screen.getByDisplayValue("你好，我是小助手")).not.toBeNull();
  });

  it("saves edited placeholder and greeting into frontmatter", async () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByDisplayValue("输入消息…"), { target: { value: "问吧" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const content = onSubmit.mock.calls[0]?.[1] as unknown as string;
    expect(content).toContain("问吧");
    expect(content).toContain("你好，我是小助手");
  });
});

describe("AgentDialogForm allowInlineHtml switch", () => {
  function htmlSwitch(): HTMLElement {
    const row = screen.getByText("HTML 内联渲染").closest("div.flex");
    if (!row) throw new Error("allowInlineHtml row not rendered");
    return within(row as HTMLElement).getByRole("switch");
  }

  const RAW_HTML = [
    "---",
    "name: Helper",
    "allowInlineHtml: true",
    "---",
    "",
    "system prompt",
  ].join("\n");

  function renderHtmlForm(
    onSubmit = vi.fn(async (_slug: string, _content: string, _theme: string) => {}),
  ) {
    renderWithProviders(
      <AgentDialogForm
        initial={{ raw: RAW_HTML, theme: "" }}
        mode="edit"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
      { queryClient: createTestQueryClient(), bridge: createMockHostBridge() },
    );
    return onSubmit;
  }

  it("shows the switch on when frontmatter enables it", () => {
    renderHtmlForm();
    expect(htmlSwitch()).toHaveAttribute("aria-checked", "true");
  });

  it("writes allowInlineHtml into frontmatter when toggled on", async () => {
    const onSubmit = renderForm();
    expect(htmlSwitch()).toHaveAttribute("aria-checked", "false");
    fireEvent.click(htmlSwitch());
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[1] as unknown as string).toContain("allowInlineHtml: true");
  });

  it("omits allowInlineHtml from frontmatter when off", async () => {
    const onSubmit = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[1] as unknown as string).not.toContain("allowInlineHtml");
  });
});
