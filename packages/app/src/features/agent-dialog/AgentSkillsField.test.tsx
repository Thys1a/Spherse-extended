import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import { AgentSkillsField } from "./AgentSkillsField";
import type { SkillSummary } from "../../lib/types";

afterEach(() => {
  cleanup();
});

const PROJECT_A = {
  name: "research",
  description: "Research skill",
  filePath: "/p/.spherse/skills/research/SKILL.md",
  source: "project",
  files: [],
} as SkillSummary;

const PROJECT_B = {
  name: "writing",
  description: "Writing skill",
  filePath: "/p/.agents/skills/writing/SKILL.md",
  source: "project",
  files: [],
} as SkillSummary;

const USER_SKILL = {
  name: "personal",
  description: "User skill",
  filePath: "/home/u/.config/opencode/skills/personal/SKILL.md",
  source: "user",
  files: [],
} as SkillSummary;

const SKILLS = [PROJECT_A, PROJECT_B, USER_SKILL];

function switches(): HTMLElement[] {
  return screen.getAllByRole("switch");
}

describe("AgentSkillsField", () => {
  it("renders nothing when there are no project skills", () => {
    const { container } = renderWithProviders(
      <AgentSkillsField skills={[USER_SKILL]} value={undefined} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("excludes user skills from the project allowlist", () => {
    renderWithProviders(<AgentSkillsField skills={SKILLS} value={undefined} onChange={vi.fn()} />);
    expect(screen.getByText("research")).toBeInTheDocument();
    expect(screen.getByText("writing")).toBeInTheDocument();
    expect(screen.queryByText("personal")).not.toBeInTheDocument();
  });

  it("checks every project skill when the allowlist is undefined (all-on)", () => {
    renderWithProviders(<AgentSkillsField skills={SKILLS} value={undefined} onChange={vi.fn()} />);
    for (const sw of switches()) {
      expect(sw).toHaveAttribute("aria-checked", "true");
    }
  });

  it("unchecking one skill reports the remaining names", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<AgentSkillsField skills={SKILLS} value={undefined} onChange={onChange} />);
    const row = screen.getByText("research").closest("div.justify-between");
    if (!row) throw new Error("research row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["writing"]);
  });

  it("unchecking the last skill reports an explicit empty list (all-off)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<AgentSkillsField skills={SKILLS} value={["research"]} onChange={onChange} />);
    const row = screen.getByText("research").closest("div.justify-between");
    if (!row) throw new Error("research row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("re-checking every skill collapses back to undefined (all-on)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<AgentSkillsField skills={SKILLS} value={["research"]} onChange={onChange} />);
    const row = screen.getByText("writing").closest("div.justify-between");
    if (!row) throw new Error("writing row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
