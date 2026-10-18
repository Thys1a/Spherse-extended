import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { translate } from "@spherse/i18n";
import type { QuickReply } from "@spherse/core";
import { renderWithProviders } from "../../test/render";
import { QuickReplyManagerDialog } from "./QuickReplyManagerDialog";

function renderDialog(replies: QuickReply[] = [], onChange = vi.fn()) {
  renderWithProviders(
    <QuickReplyManagerDialog replies={replies} onChange={onChange} onClose={vi.fn()} />,
  );
  return { onChange };
}

async function fillDraft(user: ReturnType<typeof userEvent.setup>, label: string, text: string, description?: string) {
  await user.type(screen.getByPlaceholderText(translate("zh-CN", "agent-dialog.quickReplyLabelPlaceholder")), label);
  if (description !== undefined) {
    await user.type(screen.getByPlaceholderText(translate("zh-CN", "agent-dialog.quickReplyDescriptionPlaceholder")), description);
  }
  await user.type(screen.getByPlaceholderText(translate("zh-CN", "agent-dialog.quickReplyTextPlaceholder")), text);
}

describe("QuickReplyManagerDialog", () => {
  it("adds an entry and propagates the new list", async () => {
    const user = userEvent.setup();
    const { onChange } = renderDialog();
    await fillDraft(user, "Hi", "hello", "Say hi");
    await user.click(screen.getByRole("button", { name: translate("zh-CN", "agent-dialog.quickRepliesAdd") }));
    expect(onChange).toHaveBeenCalledWith([
      { label: "Hi", description: "Say hi", text: "hello", action: "fill" },
    ]);
  });

  it("disables adding when the label or text is empty", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByPlaceholderText(translate("zh-CN", "agent-dialog.quickReplyTextPlaceholder")), "hello");
    expect(screen.getByRole("button", { name: translate("zh-CN", "agent-dialog.quickRepliesAdd") })).toBeDisabled();
  });

  it("disables adding at the reply cap", () => {
    const replies = Array.from({ length: 10 }, (_, i) => ({ label: `R${i}`, text: `t${i}`, action: "fill" as const }));
    renderDialog(replies);
    expect(screen.getByRole("button", { name: translate("zh-CN", "agent-dialog.quickRepliesAdd") })).toBeDisabled();
  });

  it("edits an entry in place instead of appending", async () => {
    const user = userEvent.setup();
    const { onChange } = renderDialog([
      { label: "A", text: "a", action: "fill" },
      { label: "B", text: "b", action: "fill" },
    ]);
    const editButtons = screen.getAllByRole("button", { name: translate("zh-CN", "common.edit") });
    expect(editButtons).toHaveLength(2);
    await user.click(editButtons[1]);
    await user.clear(screen.getByPlaceholderText(translate("zh-CN", "agent-dialog.quickReplyLabelPlaceholder")));
    await user.type(screen.getByPlaceholderText(translate("zh-CN", "agent-dialog.quickReplyLabelPlaceholder")), "B2");
    await user.click(screen.getByRole("button", { name: translate("zh-CN", "agent-dialog.quickReplyUpdate") }));
    expect(onChange).toHaveBeenCalledWith([
      { label: "A", text: "a", action: "fill" },
      { label: "B2", text: "b", action: "fill" },
    ]);
  });

  it("removes entries by index", async () => {
    const user = userEvent.setup();
    const { onChange } = renderDialog([
      { label: "A", text: "a", action: "fill" },
      { label: "B", text: "b", action: "fill" },
    ]);
    const removeButtons = screen.getAllByRole("button", { name: translate("zh-CN", "common.delete") });
    await user.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith([{ label: "B", text: "b", action: "fill" }]);
  });

  it("shows the empty state without entries", () => {
    renderDialog([]);
    expect(screen.getByText(translate("zh-CN", "agent-dialog.quickRepliesEmpty"))).toBeInTheDocument();
  });

  it("closes on done", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <QuickReplyManagerDialog replies={[]} onChange={vi.fn()} onClose={onClose} />,
    );
    await user.click(screen.getByRole("button", { name: translate("zh-CN", "agent-dialog.quickRepliesDone") }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
