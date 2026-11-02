import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { translate } from "@spherse/i18n";
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

const BUILTIN_SKILL = {
  name: "guide",
  description: "Builtin skill",
  filePath: "builtin://guide/SKILL.md",
  source: "builtin",
  files: [],
} as SkillSummary;

const SKILLS = [PROJECT_A, PROJECT_B, USER_SKILL];

function renderField(props: Partial<Parameters<typeof AgentSkillsField>[0]> = {}) {
  renderWithProviders(
    <AgentSkillsField
      skills={SKILLS}
      value={undefined}
      onChange={vi.fn()}
      userValue={undefined}
      onUserChange={vi.fn()}
      {...props}
    />,
  );
}

function switches(): HTMLElement[] {
  return screen.getAllByRole("switch");
}

describe("AgentSkillsField project group", () => {
  it("renders nothing when there are no skills at all", () => {
    const { container } = renderWithProviders(
      <AgentSkillsField skills={[]} value={undefined} onChange={vi.fn()} userValue={undefined} onUserChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps user skills out of the project allowlist", () => {
    renderField();
    expect(screen.getByText("research")).toBeInTheDocument();
    expect(screen.getByText("writing")).toBeInTheDocument();
  });

  it("checks every project skill when the allowlist is undefined (all-on)", () => {
    renderField({ skills: [PROJECT_A, PROJECT_B] });
    for (const sw of switches()) {
      expect(sw).toHaveAttribute("aria-checked", "true");
    }
  });

  it("unchecking one skill reports the remaining names", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderField({ skills: [PROJECT_A, PROJECT_B], onChange });
    const row = screen.getByText("research").closest("div.justify-between");
    if (!row) throw new Error("research row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["writing"]);
  });

  it("unchecking the last skill reports an explicit empty list (all-off)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderField({ skills: [PROJECT_A, PROJECT_B], value: ["research"], onChange });
    const row = screen.getByText("research").closest("div.justify-between");
    if (!row) throw new Error("research row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("drops stale names that are no longer in the project skill set", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderField({
      skills: [PROJECT_A, PROJECT_B],
      value: ["research", "deleted-skill"],
      onChange,
    });
    const row = screen.getByText("writing").closest("div.justify-between");
    if (!row) throw new Error("writing row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("re-checking every skill collapses back to undefined (all-on)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderField({ skills: [PROJECT_A, PROJECT_B], value: ["research"], onChange });
    const row = screen.getByText("writing").closest("div.justify-between");
    if (!row) throw new Error("writing row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("renders only the project group when no builtin skills exist", () => {
    renderField({ skills: [PROJECT_A] });
    expect(
      screen.queryByText(translate("zh-CN", "agent-dialog.builtinSkillsLabel")),
    ).not.toBeInTheDocument();
  });
});

describe("AgentSkillsField builtin group", () => {
  it("renders the builtin group collapsed by default", () => {
    renderField({ skills: [BUILTIN_SKILL] });
    expect(
      screen.getAllByText(translate("zh-CN", "agent-dialog.builtinSkillsLabel")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("guide")).not.toBeInTheDocument();
  });

  it("expanding the builtin group reveals its rows", async () => {
    const user = userEvent.setup();
    renderField({ skills: [BUILTIN_SKILL] });
    const triggers = screen.getAllByRole("button", {
      name: translate("zh-CN", "agent-dialog.builtinSkillsLabel"),
    });
    await user.click(triggers[0]);
    expect(screen.getByText("guide")).toBeInTheDocument();
  });

  it("builtin switches follow the project allowlist (checked when undefined)", async () => {
    const user = userEvent.setup();
    renderField({ skills: [BUILTIN_SKILL], value: undefined });
    await user.click(
      screen.getAllByRole("button", { name: translate("zh-CN", "agent-dialog.builtinSkillsLabel") })[0],
    );
    const row = screen.getByText("guide").closest("div.justify-between");
    if (!row) throw new Error("guide row not rendered");
    expect(within(row as HTMLElement).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("unchecking the last project skill while a builtin is checked reports the builtin", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderField({ skills: [PROJECT_A, BUILTIN_SKILL], value: undefined, onChange });
    await user.click(
      screen.getAllByRole("button", { name: translate("zh-CN", "agent-dialog.builtinSkillsLabel") })[0],
    );
    const row = screen.getByText("research").closest("div.justify-between");
    if (!row) throw new Error("research row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(["guide"]);
  });

  it("checking every project and builtin skill collapses back to undefined", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderField({ skills: [PROJECT_A, BUILTIN_SKILL], value: ["research"], onChange });
    await user.click(
      screen.getAllByRole("button", { name: translate("zh-CN", "agent-dialog.builtinSkillsLabel") })[0],
    );
    const row = screen.getByText("guide").closest("div.justify-between");
    if (!row) throw new Error("guide row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe("AgentSkillsField user group", () => {
  it("renders the user group when only user skills exist", () => {
    renderField({ skills: [USER_SKILL] });
    expect(screen.getByText("personal")).toBeInTheDocument();
    expect(screen.getByText(translate("zh-CN", "agent-dialog.userSkillsLabel"))).toBeInTheDocument();
  });

  it("leaves the user skill unchecked when userValue is undefined (default off)", () => {
    renderField({ skills: [USER_SKILL] });
    expect(switches()).toHaveLength(1);
    expect(switches()[0]).toHaveAttribute("aria-checked", "false");
  });

  it("checking one user skill writes only that name (no all-on inversion)", async () => {
    const user = userEvent.setup();
    const onUserChange = vi.fn();
    renderField({ userValue: undefined, onUserChange });
    const row = screen.getByText("personal").closest("div.justify-between");
    if (!row) throw new Error("personal row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    expect(onUserChange).toHaveBeenCalledWith(["personal"]);
  });

  it("unchecking the user skill reports an explicit empty list via onUserChange", async () => {
    const user = userEvent.setup();
    const onUserChange = vi.fn();
    const onChange = vi.fn();
    renderField({ userValue: ["personal"], onUserChange, onChange });
    const row = screen.getByText("personal").closest("div.justify-between");
    if (!row) throw new Error("personal row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    expect(onUserChange).toHaveBeenCalledWith([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("re-checking the user skill writes an explicit list (no folding)", async () => {
    const user = userEvent.setup();
    const onUserChange = vi.fn();
    renderField({ userValue: [], onUserChange });
    const row = screen.getByText("personal").closest("div.justify-between");
    if (!row) throw new Error("personal row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    expect(onUserChange).toHaveBeenCalledWith(["personal"]);
  });

  it("preserves hidden names when toggling a visible user skill", async () => {
    const user = userEvent.setup();
    const onUserChange = vi.fn();
    renderField({ userValue: ["personal", "globally-hidden"], onUserChange });
    const row = screen.getByText("personal").closest("div.justify-between");
    if (!row) throw new Error("personal row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    expect(onUserChange).toHaveBeenCalledWith(["globally-hidden"]);
  });

  it("never folds a full user selection back to undefined", async () => {
    const user = userEvent.setup();
    const onUserChange = vi.fn();
    renderField({
      skills: [USER_SKILL, { ...USER_SKILL, name: "sidekick", filePath: "/home/u/sidekick/SKILL.md" }],
      userValue: ["personal"],
      onUserChange,
    });
    const row = screen.getByText("sidekick").closest("div.justify-between");
    if (!row) throw new Error("sidekick row not rendered");
    await user.click(within(row as HTMLElement).getByRole("switch"));
    expect(onUserChange).toHaveBeenCalledWith(["personal", "sidekick"]);
  });
});
