import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createTestQueryClient, renderWithProviders } from "../../test/render";
import { createMockHostBridge } from "../../test/host-bridge";
import { AgentCardLinksField } from "./AgentCardLinksField";
import type { ApiClient } from "../../lib/api";

function mockClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listAgentCardLinks: vi.fn(async () => []),
    addAgentCardLink: vi.fn(async (_id: string, path: string) => ({
      name: path.split("/").pop() ?? path,
      target: path,
      dangling: false,
    })),
    removeAgentCardLink: vi.fn(async () => ({ ok: true })),
    ...overrides,
  } as unknown as ApiClient;
}

function renderField(client: ApiClient) {
  return renderWithProviders(<AgentCardLinksField agentId="a1" client={client} />, {
    queryClient: createTestQueryClient(),
    bridge: createMockHostBridge(),
  });
}

describe("AgentCardLinksField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists existing links with targets", async () => {
    const client = mockClient({
      listAgentCardLinks: vi.fn(async () => [
        { name: "lore.card.json", target: "lore/lore.card.json", dangling: false },
      ]),
    });
    renderField(client);
    await waitFor(() => expect(screen.getByText("lore/lore.card.json")).not.toBeNull());
    expect(client.listAgentCardLinks).toHaveBeenCalledWith("a1");
  });

  it("marks dangling links", async () => {
    const client = mockClient({
      listAgentCardLinks: vi.fn(async () => [
        { name: "gone.card.json", target: "", dangling: true },
      ]),
    });
    renderField(client);
    await waitFor(() => expect(screen.getByText(/gone\.card\.json/)).not.toBeNull());
  });

  it("removes a link and reloads", async () => {
    const client = mockClient({
      listAgentCardLinks: vi
        .fn(async () => [{ name: "lore.card.json", target: "lore/lore.card.json", dangling: false }]),
    });
    const user = userEvent.setup();
    renderField(client);
    await waitFor(() => expect(screen.getByText("lore/lore.card.json")).not.toBeNull());
    const badge = screen.getByText("lore/lore.card.json").closest("div");
    const removeBtn = badge?.querySelector("button");
    expect(removeBtn).not.toBeNull();
    await user.click(removeBtn!);
    await waitFor(() =>
      expect(client.removeAgentCardLink).toHaveBeenCalledWith("a1", "lore.card.json"),
    );
  });

  it("adds a link by typing a path and pressing Enter", async () => {
    const client = mockClient();
    const user = userEvent.setup();
    renderField(client);
    await waitFor(() => expect(client.listAgentCardLinks).toHaveBeenCalledWith("a1"));
    const input = screen.getByPlaceholderText(/\.card\.json/);
    await user.type(input, "lore/kings.card.json{Enter}");
    await waitFor(() =>
      expect(client.addAgentCardLink).toHaveBeenCalledWith("a1", "lore/kings.card.json"),
    );
    expect(client.listAgentCardLinks).toHaveBeenCalledTimes(2);
  });

  it("shows API errors", async () => {
    const client = mockClient({
      listAgentCardLinks: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    renderField(client);
    await waitFor(() => expect(screen.getByText("offline")).not.toBeNull());
  });
});

