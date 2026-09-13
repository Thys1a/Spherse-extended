import { cleanup, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { createMockHostBridge } from "../../test/host-bridge";
import { createTestQueryClient, renderWithProviders } from "../../test/render";
import { Composer } from "./Composer";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => ({
    uploadAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
    getPreviewUrl: (path: string) => `http://localhost:5173/api/projects/p1/preview/${path}`,
    getSupportedProviders: vi.fn(async () => ({})),
    listProjectSessions: vi.fn(async () => ({ sessions: [], byAgent: {} })),
    listAgents: vi.fn(async () => [
      { id: "a1", name: "Builder", slug: "build" },
      { id: "a2", name: "Writer", slug: "writer" },
    ]),
    listSkills: vi.fn(async () => [{ name: "review", description: "Review code" }]),
    listCommands: vi.fn(async () => [{ name: "test", description: "Run tests" }]),
    setSessionModel: vi.fn(),
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

function renderSlashComposer() {
  const onSend = vi.fn(() => true);
  renderWithProviders(
    <Composer streaming={false} loading={false} sessionId="session-1" onSend={onSend} onAbort={vi.fn()} />,
    { queryClient: createTestQueryClient(), bridge: createMockHostBridge() },
  );
  return { onSend };
}

describe("Composer slash completion", () => {
  it("lists skills and commands on /skill: and completes on Enter", async () => {
    renderSlashComposer();
    const box = screen.getByRole("textbox");
    await user.type(box, "/");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();

    await user.type(box, "skill:");
    expect(await screen.findByRole("option", { name: /review/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /test/ })).not.toBeInTheDocument();

    await user.clear(box);
    await user.type(box, "/command:");
    expect(await screen.findByRole("option", { name: /test/ })).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, "/skill:re");
    await user.keyboard("{Enter}");
    expect(box).toHaveValue("/skill:review ");
  });

  it("lists agents on >>", async () => {
    renderSlashComposer();
    await user.type(screen.getByRole("textbox"), ">>bu");

    expect(await screen.findByRole("option", { name: /build/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /writer/ })).not.toBeInTheDocument();
  });

  it("blocks sending an unknown slash name with a toast", async () => {
    const { onSend } = renderSlashComposer();
    await user.type(screen.getByRole("textbox"), "/skill:nope do it");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(onSend).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
