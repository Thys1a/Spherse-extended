import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { cleanup, renderHook, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { translate } from "@spherse/i18n";
import { createMockHostBridge } from "../../test/host-bridge";
import { createTestQueryClient, renderWithProviders } from "../../test/render";
import { useAllSkills } from "../../queries/skills";
import type { ApiClient } from "../../lib/api";
import { UserSkillsPanel } from "./UserSkillsPanel";
import type { UserSkillSettingsResponse } from "@spherse/contracts";

const SETTINGS: UserSkillSettingsResponse = {
  customDirs: [],
  enabled: [],
  sources: [
    {
      key: "agents",
      dir: "/home/u/.agents/skills",
      custom: false,
      exists: true,
      skills: [
        { name: "personal", description: "Personal skill", dir: "/home/u/.agents/skills/personal", enabled: false },
      ],
    },
    {
      key: "claude",
      dir: "/home/u/.claude/skills",
      custom: false,
      exists: false,
      skills: [],
    },
  ],
};

const getUserSkillSettings = vi.fn(async (): Promise<UserSkillSettingsResponse> => ({ ...SETTINGS }));
const updateUserSkillSettings = vi.fn(
  async (next: { customDirs: string[]; enabled: string[] }): Promise<UserSkillSettingsResponse> => ({
    ...SETTINGS,
    ...next,
    sources: SETTINGS.sources.map((s) => ({
      ...s,
      skills: s.skills.map((skill) => ({ ...skill, enabled: next.enabled.includes(skill.dir) })),
    })),
  }),
);

vi.mock("../../lib/use-connection", () => ({
  useGlobalApiClient: () => ({ getUserSkillSettings, updateUserSkillSettings }),
}));

const selectDirectory = vi.fn(async (): Promise<string | null> => null);

function renderPanel() {
  const queryClient = createTestQueryClient();
  renderWithProviders(<UserSkillsPanel />, {
    bridge: createMockHostBridge({
      project: {
        selectDirectory,
        selectSkillZip: vi.fn(async () => null),
      } as never,
    }),
    queryClient,
  });
  return queryClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("UserSkillsPanel", () => {
  it("loads and groups user skills by source", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("personal")).toBeInTheDocument();
    });
    expect(getUserSkillSettings).toHaveBeenCalled();
    expect(screen.getByText(translate("zh-CN", "settings.userSkills.title"))).toBeInTheDocument();
  });

  it("marks missing source directories as not found", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(translate("zh-CN", "settings.userSkills.notFound"))).toBeInTheDocument();
    });
  });

  it("toggling a skill saves the updated enabled list", async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("personal")).toBeInTheDocument();
    });
    const row = screen.getByText("personal").closest("div.justify-between");
    if (!row) throw new Error("skill row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    await waitFor(() => {
      expect(updateUserSkillSettings).toHaveBeenCalledTimes(1);
    });
    expect(updateUserSkillSettings).toHaveBeenCalledWith({
      customDirs: [],
      enabled: ["/home/u/.agents/skills/personal"],
    });
  });

  it("refetches mounted skill lists after saving", async () => {
    const user = userEvent.setup();
    const queryClient = renderPanel();
    const listSkills = vi.fn().mockResolvedValue([]);
    const apiClient = { listSkills } as unknown as ApiClient;
    const { result } = renderHook(() => useAllSkills("p1", apiClient), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(listSkills).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText("personal")).toBeInTheDocument();
    });
    const row = screen.getByText("personal").closest("div.justify-between");
    if (!row) throw new Error("skill row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    await waitFor(() => {
      expect(updateUserSkillSettings).toHaveBeenCalledTimes(1);
      expect(listSkills).toHaveBeenCalledTimes(2);
    });
  });

  it("adding a custom directory calls the directory picker and saves", async () => {
    const user = userEvent.setup();
    selectDirectory.mockResolvedValueOnce("/home/u/extra-skills");
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("personal")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: translate("zh-CN", "settings.userSkills.addCustomDir") }),
    );
    await waitFor(() => {
      expect(selectDirectory).toHaveBeenCalledTimes(1);
      expect(updateUserSkillSettings).toHaveBeenCalledWith({
        customDirs: ["/home/u/extra-skills"],
        enabled: [],
      });
    });
  });
});
