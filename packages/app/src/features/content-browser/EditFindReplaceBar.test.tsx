import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { translate } from "@spherse/i18n";
import { renderWithProviders } from "../../test/render";
import { EditFindReplaceBar } from "./EditFindReplaceBar";

function Harness({ initial = "foo bar foo" }: { initial?: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(initial);
  return (
    <>
      <textarea ref={ref} value={value} onChange={(e) => setValue(e.target.value)} data-testid="editor" />
      <EditFindReplaceBar text={value} textareaRef={ref} onReplace={setValue} onClose={() => {}} />
    </>
  );
}

function typeQuery(query: string) {
  fireEvent.change(screen.getByLabelText(translate("zh-CN", "content-browser.find.placeholder")), {
    target: { value: query },
  });
}

function typeReplacement(replacement: string) {
  fireEvent.change(screen.getByLabelText(translate("zh-CN", "content-browser.find.replacementPlaceholder")), {
    target: { value: replacement },
  });
}

describe("EditFindReplaceBar", () => {
  it("shows the match count and replaces a single match", () => {
    renderWithProviders(<Harness />);
    typeQuery("foo");
    typeReplacement("baz");

    expect(screen.getByText("1/2")).toBeInTheDocument();
    fireEvent.click(screen.getByText(translate("zh-CN", "content-browser.find.replace")));

    expect((screen.getByTestId("editor") as HTMLTextAreaElement).value).toBe("baz bar foo");
  });

  it("replaces all matches and toasts the count", () => {
    renderWithProviders(<Harness />);
    typeQuery("foo");
    typeReplacement("baz");
    fireEvent.click(screen.getByText(translate("zh-CN", "content-browser.find.replaceAll")));

    expect((screen.getByTestId("editor") as HTMLTextAreaElement).value).toBe("baz bar baz");
  });

  it("requires confirmation for empty replacement", () => {
    const onReplace = vi.fn();
    const ref = { current: null };
    renderWithProviders(
      <EditFindReplaceBar text="a-b" textareaRef={ref} onReplace={onReplace} onClose={() => {}} />,
    );
    typeQuery("-");

    fireEvent.click(screen.getByText(translate("zh-CN", "content-browser.find.replaceAll")));
    expect(onReplace).not.toHaveBeenCalled();
    expect(
      screen.getByText(translate("zh-CN", "content-browser.find.confirmDelete", { count: 1 })),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByText(translate("zh-CN", "content-browser.find.confirmDelete", { count: 1 })),
    );
    expect(onReplace).toHaveBeenCalledWith("ab");
  });

  it("navigates matches with next and previous buttons", () => {
    renderWithProviders(<Harness />);
    typeQuery("foo");

    fireEvent.click(screen.getByLabelText(translate("zh-CN", "content-browser.find.next")));
    expect(screen.getByText("2/2")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(translate("zh-CN", "content-browser.find.previous")));
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("selects the match and focuses without scrolling on jump", async () => {
    const focusSpy = vi.spyOn(HTMLTextAreaElement.prototype, "focus");
    try {
      renderWithProviders(<Harness />);
      typeQuery("foo");

      fireEvent.click(screen.getByLabelText(translate("zh-CN", "content-browser.find.next")));

      const editor = screen.getByTestId("editor") as HTMLTextAreaElement;
      expect(editor.selectionStart).toBe(8);
      expect(editor.selectionEnd).toBe(11);
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(editor.scrollTop).toBe(0);
    } finally {
      focusSpy.mockRestore();
    }
  });

  it("restores selection to the same match index after a single replace", () => {
    renderWithProviders(<Harness />);
    typeQuery("foo");
    typeReplacement("baz");

    fireEvent.click(screen.getByText(translate("zh-CN", "content-browser.find.replace")));

    const editor = screen.getByTestId("editor") as HTMLTextAreaElement;
    expect(editor.value).toBe("baz bar foo");
    expect(editor.selectionStart).toBe(8);
    expect(editor.selectionEnd).toBe(11);
  });
});
