import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { translate } from "@spherse/i18n";
import { renderWithProviders } from "../../test/render";
import { Header } from "./Header";

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    filePath: "a.md",
    isDirty: false,
    isEditing: false,
    isEditable: true,
    isHtml: false,
    htmlView: "preview" as const,
    saving: false,
    findable: true,
    tocAvailable: false,
    onBack: vi.fn(),
    onClose: vi.fn(),
    onEnterEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onSave: vi.fn(),
    onHtmlViewChange: vi.fn(),
    onRefresh: vi.fn(),
    onFindToggle: vi.fn(),
    onTocToggle: vi.fn(),
    ...overrides,
  };
}

describe("Header split entry", () => {
  it("shows the split button when onSplit is provided and not editing", () => {
    renderWithProviders(<Header {...baseProps({ onSplit: vi.fn() })} />);

    expect(screen.getByTitle(translate("zh-CN", "tabs.splitRight"))).toBeInTheDocument();
  });

  it("hides the split button while editing", () => {
    renderWithProviders(<Header {...baseProps({ onSplit: vi.fn(), isEditing: true })} />);

    expect(screen.queryByTitle(translate("zh-CN", "tabs.splitRight"))).toBeNull();
  });

  it("hides the split button without onSplit", () => {
    renderWithProviders(<Header {...baseProps()} />);

    expect(screen.queryByTitle(translate("zh-CN", "tabs.splitRight"))).toBeNull();
  });
});
