import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { createMockHostBridge } from "../../test/host-bridge";
import { renderWithProviders } from "../../test/render";
import { MessageList } from "./MessageList";

const agent = { id: "a1", name: "Helper", slug: "helper" };

function renderEmptyList(greeting?: string) {
  return renderWithProviders(
    <MessageList
      messages={[]}
      agent={agent}
      greeting={greeting}
      sessionId="s1"
      streaming={false}
      containerRef={{ current: null }}
      isAtBottom
      onScrollToBottom={vi.fn()}
    />,
  );
}

describe("MessageList empty state (R4.2)", () => {
  it("shows the agent greeting when provided", () => {
    renderEmptyList("你好，我是小助手");
    expect(screen.getByText("你好，我是小助手")).not.toBeNull();
    expect(screen.queryByText("Helper")).not.toBeNull();
  });

  it("falls back to the generic hint without a greeting", () => {
    const { container } = renderEmptyList();
    expect(container.querySelector("[data-chat-welcome]")).not.toBeNull();
  });
});

describe("MessageList delete rule", () => {
  function renderDeletable(messages: { role: "user" | "assistant"; content: string }[]) {
    const onDelete = vi.fn();
    renderWithProviders(
      <MessageList
        messages={messages}
        agent={agent}
        sessionId="s1"
        streaming={false}
        containerRef={{ current: null }}
        isAtBottom
        onScrollToBottom={vi.fn()}
        onDelete={onDelete}
      />,
      { bridge: createMockHostBridge() },
    );
    return { onDelete };
  }

  it("shows delete on the last-turn assistant message and calls back", async () => {
    const user = userEvent.setup();
    const { onDelete } = renderDeletable([
      { role: "user", content: "q" },
      { role: "assistant", content: "a" },
    ]);
    await user.click(screen.getByRole("button", { name: "删除" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("shows delete only on the latest assistant of the last turn", () => {
    renderDeletable([
      { role: "user", content: "q" },
      { role: "assistant", content: "a1" },
      { role: "assistant", content: "a2" },
    ]);
    expect(screen.getAllByRole("button", { name: "删除" })).toHaveLength(1);
  });

  it("hides delete on older-turn assistant messages", () => {
    renderDeletable([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
    ]);
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
  });
});
