import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QuickReplyBar } from "./QuickReplyBar";
import { useComposerInsertStore } from "./composer-insert-store";

describe("QuickReplyBar", () => {
  it("renders nothing without replies", () => {
    render(<QuickReplyBar sessionId="s1" replies={[]} />);
    expect(document.querySelector("[data-chat-quick-replies]")).toBeNull();
  });

  it("fills the composer insert store on click", async () => {
    const user = userEvent.setup();
    useComposerInsertStore.setState({ sessionId: null, text: "", nonce: 0 });
    render(
      <QuickReplyBar
        sessionId="s1"
        replies={[{ label: "Hi", description: "Say hi", text: "hello", action: "fill" }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Hi" }));
    expect(useComposerInsertStore.getState()).toMatchObject({ sessionId: "s1", text: "hello" });
    useComposerInsertStore.setState({ sessionId: null, text: "", nonce: 0 });
  });
});
