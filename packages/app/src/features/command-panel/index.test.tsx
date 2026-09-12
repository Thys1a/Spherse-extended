import { cleanup, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { createMockHostBridge } from "../../test/host-bridge";
import { createTestQueryClient, renderWithProviders } from "../../test/render";
import type { CommandDefinition } from "../../lib/types";
import { CommandPanel } from "./index";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const listCommands = vi.fn();
const createCommand = vi.fn();
const updateCommand = vi.fn();
const deleteCommand = vi.fn();

vi.mock("../../lib/use-connection", () => ({
  useApiClient: () => ({ listCommands, createCommand, updateCommand, deleteCommand }),
  useConnection: () => ({ baseUrl: "http://localhost:5173", accessToken: null }),
}));

const COMMAND: CommandDefinition = {
  name: "test",
  description: "Run tests",
  template: "Run $ARGUMENTS",
  filePath: "/tmp/.spherse/commands/test.md",
};

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
  listCommands.mockResolvedValue([COMMAND]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPanel() {
  const queryClient = createTestQueryClient();
  renderWithProviders(<CommandPanel />, {
    queryClient,
    bridge: createMockHostBridge(),
    projectId: "p1",
  });
  return queryClient;
}

describe("CommandPanel", () => {
  it("lists commands with descriptions", async () => {
    renderPanel();
    expect(await screen.findByText("/command:test")).toBeInTheDocument();
    expect(await screen.findByText("Run tests")).toBeInTheDocument();
  });

  it("creates a command through the dialog", async () => {
    createCommand.mockResolvedValue({ ...COMMAND, name: "new" });
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "命令菜单" }));
    await user.click(await screen.findByRole("menuitem", { name: "新建命令" }));
    await user.type(await screen.findByLabelText("名称"), "new");
    await user.type(screen.getByLabelText("模板"), "Do $ARGUMENTS");
    await user.click(screen.getByRole("button", { name: "创建" }));

    expect(createCommand).toHaveBeenCalledWith({
      name: "new",
      description: undefined,
      model: undefined,
      template: expect.stringContaining("Do $ARGUMENTS"),
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it("deletes a command", async () => {
    deleteCommand.mockResolvedValue({ ok: true });
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "删除" }));

    expect(deleteCommand).toHaveBeenCalledWith("test");
    expect(toast.success).toHaveBeenCalled();
  });
});
