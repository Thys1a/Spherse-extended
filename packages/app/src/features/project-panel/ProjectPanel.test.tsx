import type { ReactNode } from "react";
import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createTestQueryClient, renderWithProviders } from "../../test/render";
import { createMockHostBridge } from "../../test/host-bridge";
import { useAppUiStore } from "../../stores/app-ui-store";
import { ProjectPanel } from "./index";

vi.mock("../../hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));
vi.mock("../agent-session-list", () => ({
  AgentSessionList: () => null,
}));
vi.mock("../skill-panel", () => ({
  SkillPanel: () => null,
}));
vi.mock("../command-panel", () => ({
  CommandPanel: () => null,
}));
vi.mock("../user-file-panel", () => ({
  UserFilePanel: () => null,
}));
vi.mock("../custom-side-panel", () => ({
  CustomSidePanel: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("ProjectPanel search entry", () => {
  it("opens global search from the visible search button", async () => {
    useAppUiStore.getState().setGlobalSearchOpen(false);
    const user = userEvent.setup();
    renderWithProviders(<ProjectPanel />, {
      bridge: createMockHostBridge(),
      queryClient: createTestQueryClient(),
    });

    await user.click(screen.getByRole("button", { name: "搜索" }));
    expect(useAppUiStore.getState().globalSearchOpen).toBe(true);
  });
});
