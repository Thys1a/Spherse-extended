import { cleanup, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { createMockHostBridge } from "../../test/host-bridge";
import { createTestQueryClient, renderWithProviders } from "../../test/render";
import type { QueryClient } from "@tanstack/react-query";
import { projectQueryKeys } from "../../queries/keys";
import type { AgentSummary, SessionInfo } from "../../lib/types";
import { SessionModelPill } from "./SessionModelPill";

const getSupportedProviders = vi.fn();
const setSessionModel = vi.fn();
const mockClient = { getSupportedProviders, setSessionModel };

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => mockClient,
  useConnection: () => ({ baseUrl: "http://localhost:5173", accessToken: null }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const catalog = {
  openai: {
    id: "openai",
    name: "OpenAI",
    auth: { type: "apiKey", envKeys: [] },
    models: [
      { id: "gpt-4o", name: "GPT-4o", provider: "openai", api: "openai", reasoning: false, input: ["text"] },
      { id: "o1", name: "O1", provider: "openai", api: "openai", reasoning: true, input: ["text"] },
    ],
  },
};

const settings = {
  models: {
    text: { defaultModel: "openai/gpt-4o", providers: { openai: { apiKey: "k" } } },
  },
};

const agent = { id: "a1", name: "Helper", slug: "helper", model: "openai/o1" } as AgentSummary;

function seedQueryClient(queryClient: QueryClient, session: SessionInfo) {
  queryClient.setQueryData(projectQueryKeys.session("p1", session.id), session);
  queryClient.setQueryData(projectQueryKeys.agents("p1"), [agent]);
}

function renderPill(session: SessionInfo) {
  const queryClient = createTestQueryClient();
  seedQueryClient(queryClient, session);
  const bridge = createMockHostBridge({ getSettings: vi.fn(async () => settings) });
  renderWithProviders(<SessionModelPill sessionId={session.id} />, { queryClient, bridge });
}

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
  getSupportedProviders.mockResolvedValue(catalog);
  setSessionModel.mockImplementation(async (_agentId: string, id: string, modelId: string) => ({
    id,
    agentId: "a1",
    createdAt: 1,
    updatedAt: 2,
    status: "active",
    ...(modelId ? { model: modelId } : {}),
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const baseSession: SessionInfo = {
  id: "s1",
  agentId: "a1",
  createdAt: 1,
  updatedAt: 2,
  status: "active",
};

describe("SessionModelPill", () => {
  it("shows the session model when set", async () => {
    renderPill({ ...baseSession, model: "openai/o1" });
    expect(await screen.findByRole("button", { name: "O1" })).toBeInTheDocument();
  });

  it("falls back to the agent model and then the global default", async () => {
    renderPill(baseSession);
    expect(await screen.findByRole("button", { name: "O1" })).toBeInTheDocument();
  });

  it("switches the session model from the dropdown", async () => {
    renderPill({ ...baseSession, model: "openai/gpt-4o" });
    await user.click(await screen.findByRole("button", { name: "GPT-4o" }));
    await user.click(await screen.findByRole("menuitem", { name: "O1" }));
    expect(setSessionModel).toHaveBeenCalledWith("a1", "s1", "openai/o1");
  });

  it("clears the override through the follow-default item", async () => {
    renderPill({ ...baseSession, model: "openai/o1" });
    await user.click(await screen.findByRole("button", { name: "O1" }));
    await user.click(await screen.findByRole("menuitem", { name: "跟随默认" }));
    expect(setSessionModel).toHaveBeenCalledWith("a1", "s1", "");
  });

  it("shows a toast when switching fails", async () => {
    setSessionModel.mockRejectedValueOnce(new Error("offline"));
    renderPill({ ...baseSession, model: "openai/gpt-4o" });
    await user.click(await screen.findByRole("button", { name: "GPT-4o" }));
    await user.click(await screen.findByRole("menuitem", { name: "O1" }));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls.at(-1)?.[0]).toContain("切换模型失败");
  });

  it("lists only follow-default when the catalog is empty", async () => {
    getSupportedProviders.mockResolvedValueOnce({});
    renderPill(baseSession);
    await user.click(await screen.findByRole("button", { name: "openai/o1" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["跟随默认"]);
  });
});
