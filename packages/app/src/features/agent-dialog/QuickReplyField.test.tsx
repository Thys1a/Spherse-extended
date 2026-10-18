import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { translate } from "@spherse/i18n";
import { renderWithProviders } from "../../test/render";
import { QuickReplyField } from "./QuickReplyField";

describe("QuickReplyField", () => {
  it("shows the reply count and opens the manager on click", async () => {
    const user = userEvent.setup();
    const onManage = vi.fn();
    renderWithProviders(
      <QuickReplyField
        replies={[{ label: "Hi", text: "hello", action: "fill" }]}
        onManage={onManage}
        label={translate("zh-CN", "agent-dialog.quickRepliesLabel")}
        hint={translate("zh-CN", "agent-dialog.quickRepliesHint")}
      />,
    );

    expect(screen.getByText(translate("zh-CN", "agent-dialog.quickRepliesCount", { count: 1 }))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: translate("zh-CN", "agent-dialog.quickRepliesManage") }));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it("shows zero count when empty", () => {
    renderWithProviders(
      <QuickReplyField
        replies={[]}
        onManage={vi.fn()}
        label={translate("zh-CN", "agent-dialog.quickRepliesLabel")}
        hint={translate("zh-CN", "agent-dialog.quickRepliesHint")}
      />,
    );

    expect(screen.getByText(translate("zh-CN", "agent-dialog.quickRepliesCount", { count: 0 }))).toBeInTheDocument();
  });
});
