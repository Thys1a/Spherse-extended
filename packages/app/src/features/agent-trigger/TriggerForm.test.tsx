import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/render";
import { TriggerForm } from "./TriggerForm";
import { emptyTriggerDraft } from "./trigger-form-helpers";

function eventDraft(eventName: string) {
  return { ...emptyTriggerDraft(), type: "event" as const, eventName };
}

const noop = () => {};

describe("TriggerForm internal event select (R2.3)", () => {
  it("lists the three sp: events plus a custom option", () => {
    renderWithProviders(
      <TriggerForm
        draft={eventDraft("")}
        isNew
        onChange={noop}
        onInsertVariable={noop}
        onSave={noop}
        onCancel={noop}
        onResetBinding={noop}
      />,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["custom", "sp:user-message", "sp:assistant-message", "sp:turn-end"]);
  });

  it("selecting a preset writes it to the draft and hides the text input", () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(
      <TriggerForm
        draft={eventDraft("")}
        isNew
        onChange={onChange}
        onInsertVariable={noop}
        onSave={noop}
        onCancel={noop}
        onResetBinding={noop}
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "sp:turn-end" } });
    expect(onChange).toHaveBeenCalledWith({ eventName: "sp:turn-end" });

    rerender(
      <TriggerForm
        draft={eventDraft("sp:turn-end")}
        isNew
        onChange={onChange}
        onInsertVariable={noop}
        onSave={noop}
        onCancel={noop}
        onResetBinding={noop}
      />,
    );
    expect(screen.queryByPlaceholderText(/daily-review/)).toBeNull();
  });

  it("keeps the text input for custom event names", () => {
    renderWithProviders(
      <TriggerForm
        draft={eventDraft("daily-review")}
        isNew
        onChange={noop}
        onInsertVariable={noop}
        onSave={noop}
        onCancel={noop}
        onResetBinding={noop}
      />,
    );

    expect(screen.getByDisplayValue("daily-review")).not.toBeNull();
  });
});
