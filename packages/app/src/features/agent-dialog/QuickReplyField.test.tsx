import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { QuickReply } from "@spherse/core";
import { QuickReplyField } from "./QuickReplyField";

function renderField(replies: QuickReply[] = [], onAdd = vi.fn(), onRemove = vi.fn()) {
  render(
    <QuickReplyField
      replies={replies}
      onAdd={onAdd}
      onRemove={onRemove}
      label="快捷回复"
      hint="hint"
      labelPlaceholder="显示名"
      descriptionPlaceholder="说明"
      textPlaceholder="文本"
      addLabel="添加"
    />,
  );
  return { onAdd, onRemove };
}

describe("QuickReplyField", () => {
  it("adds an entry and clears the inputs", async () => {
    const user = userEvent.setup();
    const { onAdd } = renderField();
    await user.type(screen.getByPlaceholderText("显示名"), "Hi");
    await user.type(screen.getByPlaceholderText("说明"), "Say hi");
    await user.type(screen.getByPlaceholderText("文本"), "hello");
    await user.click(screen.getByRole("button", { name: "添加" }));
    expect(onAdd).toHaveBeenCalledWith({ label: "Hi", description: "Say hi", text: "hello", action: "fill" });
    expect(screen.getByPlaceholderText("显示名")).toHaveValue("");
    expect(screen.getByPlaceholderText("文本")).toHaveValue("");
  });

  it("disables adding when the label or text is empty", async () => {
    const user = userEvent.setup();
    const { onAdd } = renderField();
    await user.type(screen.getByPlaceholderText("文本"), "hello");
    expect(screen.getByRole("button", { name: "添加" })).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("disables adding at the reply cap", () => {
    const replies = Array.from({ length: 10 }, (_, i) => ({ label: `R${i}`, text: `t${i}`, action: "fill" as const }));
    renderField(replies);
    expect(screen.getByRole("button", { name: "添加" })).toBeDisabled();
  });

  it("removes entries by index", async () => {
    const user = userEvent.setup();
    const { onRemove } = renderField([
      { label: "A", text: "a", action: "fill" },
      { label: "B", text: "b", action: "fill" },
    ]);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    const removeButtons = screen.getAllByRole("button", { name: "" });
    expect(removeButtons).toHaveLength(2);
    await user.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalledWith(0);
  });
});
