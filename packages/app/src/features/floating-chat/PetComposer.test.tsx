import { cleanup, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockHostBridge } from "../../test/host-bridge";
import { renderWithProviders } from "../../test/render";
import { PetComposer } from "./PetComposer";

const sendMessage = vi.fn(() => true);

vi.mock("../chat/hooks/useChatSession", () => ({
  useChatSession: () => ({ sendMessage }),
}));

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => ({}),
  useConnection: () => ({ baseUrl: "http://localhost:5173", accessToken: null }),
}));

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
  sendMessage.mockClear();
  sendMessage.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("PetComposer", () => {
  it("sends trimmed text and clears the input", async () => {
    renderWithProviders(<PetComposer sessionId="s1" agentId="a1" />, {
      bridge: createMockHostBridge(),
    });

    await user.type(screen.getByRole("textbox"), "  hello  ");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(sendMessage).toHaveBeenCalledWith("hello");
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("keeps the input when sending fails", async () => {
    sendMessage.mockReturnValue(false);
    renderWithProviders(<PetComposer sessionId="s1" agentId="a1" />, {
      bridge: createMockHostBridge(),
    });

    await user.type(screen.getByRole("textbox"), "hello");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(screen.getByRole("textbox")).toHaveValue("hello");
  });
});
