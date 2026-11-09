import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createTestQueryClient, renderWithProviders } from "../../test/render";
import { createMockHostBridge } from "../../test/host-bridge";
import { AgentDataLinksField } from "./AgentDataLinksField";
import type { ApiClient } from "../../lib/api";

function link(overrides: Record<string, unknown> = {}) {
  return {
    name: "game.data.json",
    target: "lore/game.data.json",
    dangling: false,
    hasState: true,
    statePath: "_state",
    estimatedTokens: 40,
    ...overrides,
  };
}

function mockClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listAgentDataLinks: vi.fn(async () => []),
    addAgentDataLink: vi.fn(async (_id: string, path: string) => ({
      name: path.split("/").pop() ?? path,
      target: path,
      dangling: false,
      hasState: true,
      statePath: "_state",
      estimatedTokens: 0,
    })),
    removeAgentDataLink: vi.fn(async () => ({ ok: true })),
    ...overrides,
  } as unknown as ApiClient;
}

function renderField(client: ApiClient, contextWindow?: number) {
  return renderWithProviders(
    <AgentDataLinksField agentId="a1" client={client} contextWindow={contextWindow} />,
    {
      queryClient: createTestQueryClient(),
      bridge: createMockHostBridge(),
    },
  );
}

describe("AgentDataLinksField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists existing links with targets", async () => {
    const client = mockClient({
      listAgentDataLinks: vi.fn(async () => [link()]),
    });
    renderField(client);
    await waitFor(() => expect(screen.getByText("lore/game.data.json")).not.toBeNull());
    expect(client.listAgentDataLinks).toHaveBeenCalledWith("a1");
  });

  it("marks dangling links", async () => {
    const client = mockClient({
      listAgentDataLinks: vi.fn(async () => [
        link({ name: "gone.data.json", target: "", dangling: true }),
      ]),
    });
    renderField(client);
    await waitFor(() => expect(screen.getByText(/gone\.data\.json/)).not.toBeNull());
    expect(screen.queryByText(/tok/)).toBeNull();
    expect(screen.queryByText(/合计/)).toBeNull();
  });

  it("flags links without a state declaration", async () => {
    const client = mockClient({
      listAgentDataLinks: vi.fn(async () => [link({ hasState: false, statePath: undefined, estimatedTokens: 0 })]),
    });
    renderField(client);
    await waitFor(() => expect(screen.getByText(/未声明/)).not.toBeNull());
    expect(screen.queryByText(/合计/)).toBeNull();
  });

  it("shows declared-but-inactive state path instead of no-declaration", async () => {
    const client = mockClient({
      listAgentDataLinks: vi.fn(async () => [link({ hasState: false, statePath: "stats", estimatedTokens: 0 })]),
    });
    renderField(client);
    await waitFor(() => expect(screen.getByText("stats · 未注入")).not.toBeNull());
    expect(screen.queryByText(/未声明/)).toBeNull();
    expect(screen.queryByText(/合计/)).toBeNull();
  });

  it("shows estimated tokens and totals with window ratio", async () => {
    const client = mockClient({
      listAgentDataLinks: vi.fn(async () => [link()]),
    });
    renderField(client, 200);
    await waitFor(() => expect(screen.getByText("约40 tok")).not.toBeNull());
    expect(screen.getByText(/占窗口20%/)).not.toBeNull();
  });

  it("shows totals without ratio when context window is unknown", async () => {
    const client = mockClient({
      listAgentDataLinks: vi.fn(async () => [link()]),
    });
    renderField(client);
    await waitFor(() => expect(screen.getByText(/合计/)).not.toBeNull());
    expect(screen.queryByText(/占窗口/)).toBeNull();
  });

  it("removes a link and reloads", async () => {
    const client = mockClient({
      listAgentDataLinks: vi.fn(async () => [link()]),
    });
    const user = userEvent.setup();
    renderField(client);
    await waitFor(() => expect(screen.getByText("lore/game.data.json")).not.toBeNull());
    const badge = screen.getByText("lore/game.data.json").closest("div");
    const removeBtn = badge?.querySelector("button");
    expect(removeBtn).not.toBeNull();
    await user.click(removeBtn!);
    await waitFor(() =>
      expect(client.removeAgentDataLink).toHaveBeenCalledWith("a1", "game.data.json"),
    );
  });

  it("adds a link by typing a path and pressing Enter", async () => {
    const client = mockClient();
    const user = userEvent.setup();
    renderField(client);
    await waitFor(() => expect(client.listAgentDataLinks).toHaveBeenCalledWith("a1"));
    const input = screen.getByPlaceholderText(/\.data\.json/);
    await user.type(input, "lore/game.data.json{Enter}");
    await waitFor(() =>
      expect(client.addAgentDataLink).toHaveBeenCalledWith("a1", "lore/game.data.json"),
    );
    expect(client.listAgentDataLinks).toHaveBeenCalledTimes(2);
  });

  it("shows API errors", async () => {
    const client = mockClient({
      listAgentDataLinks: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    renderField(client);
    await waitFor(() => expect(screen.getByText("offline")).not.toBeNull());
  });
});
