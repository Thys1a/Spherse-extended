import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { CompactButton } from "./CompactButton";

let user: ReturnType<typeof userEvent.setup>;
let onCompact: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  user = userEvent.setup();
  onCompact = vi.fn();
});

describe("CompactButton", () => {
  it("sends compact on click", async () => {
    renderWithProviders(
      <CompactButton compacting={false} disabled={false} onCompact={onCompact} />,
    );

    await user.click(screen.getByRole("button", { name: "压缩上下文" }));
    expect(onCompact).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner while compacting and blocks clicks when disabled", async () => {
    const { rerender } = renderWithProviders(
      <CompactButton compacting={true} disabled={false} onCompact={onCompact} />,
    );
    await user.click(screen.getByRole("button", { name: "压缩上下文" }));
    expect(onCompact).not.toHaveBeenCalled();

    rerender(<CompactButton compacting={false} disabled={true} onCompact={onCompact} />);
    await user.click(screen.getByRole("button", { name: "压缩上下文" }));
    expect(onCompact).not.toHaveBeenCalled();
  });
});
