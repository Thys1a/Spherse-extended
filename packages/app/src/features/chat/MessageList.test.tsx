import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
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
