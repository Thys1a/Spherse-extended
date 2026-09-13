import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InlineNameInput } from "./InlineNameInput";

describe("InlineNameInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("focuses the input on mount", () => {
    render(<InlineNameInput depth={0} onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("textbox")).toBe(document.activeElement);
  });

  it("ignores blur within the mount grace period (menu-close focus steal)", () => {
    const onCancel = vi.fn();
    render(<InlineNameInput depth={0} onSubmit={() => {}} onCancel={onCancel} />);
    fireEvent.blur(screen.getByRole("textbox"));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels on blur after the grace period", () => {
    const onCancel = vi.fn();
    render(<InlineNameInput depth={0} onSubmit={() => {}} onCancel={onCancel} />);
    vi.advanceTimersByTime(300);
    fireEvent.blur(screen.getByRole("textbox"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("submits a valid name on Enter", () => {
    const onSubmit = vi.fn();
    render(<InlineNameInput depth={0} onSubmit={onSubmit} onCancel={() => {}} />);
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "new-name.md" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("new-name.md");
  });

  it("cancels on Escape", () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    render(<InlineNameInput depth={0} onSubmit={onSubmit} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ignores Enter for empty or invalid names", () => {
    const onSubmit = vi.fn();
    render(<InlineNameInput depth={0} onSubmit={onSubmit} onCancel={() => {}} />);
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "   " } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.change(box, { target: { value: "a/b" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
