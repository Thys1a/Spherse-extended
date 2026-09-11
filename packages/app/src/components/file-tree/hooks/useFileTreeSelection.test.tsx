import { useRef } from "react";
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { useFileTreeSelection, type FileTreeSelection } from "./useFileTreeSelection";

const PATHS = ["a.md", "b.md", "c.md"];

function Harness({
  onSelectFile,
  onApi,
  projectId = "p1",
}: {
  onSelectFile: (filePath: string) => void;
  onApi: (api: FileTreeSelection) => void;
  projectId?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const api = useFileTreeSelection(containerRef, projectId, onSelectFile);
  onApi(api);
  return (
    <div ref={containerRef}>
      {PATHS.map((p) => (
        <button key={p} type="button" data-path={p} data-testid={`row-${p}`}>
          {p}
        </button>
      ))}
    </div>
  );
}

function renderSelection(onSelectFile: (filePath: string) => void = () => {}) {
  let api: FileTreeSelection | null = null;
  renderWithProviders(<Harness onSelectFile={onSelectFile} onApi={(a) => (api = a)} />);
  return {
    api: () => {
      if (!api) throw new Error("api not captured");
      return api;
    },
  };
}

function mouseEvent(init: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {}): React.MouseEvent {
  return { shiftKey: false, metaKey: false, ctrlKey: false, ...init } as unknown as React.MouseEvent;
}

describe("useFileTreeSelection", () => {
  it("plain click selects a single file and navigates", () => {
    const onSelectFile = vi.fn();
    const { api } = renderSelection(onSelectFile);

    act(() => {
      api().selectFileWithModifiers(mouseEvent(), "b.md");
    });

    expect([...api().selected]).toEqual(["b.md"]);
    expect(api().anchor).toBe("b.md");
    expect(onSelectFile).toHaveBeenCalledWith("b.md");
  });

  it("shift-click selects the range from the anchor without navigating", () => {
    const onSelectFile = vi.fn();
    const { api } = renderSelection(onSelectFile);

    act(() => {
      api().selectFileWithModifiers(mouseEvent(), "a.md");
    });
    onSelectFile.mockClear();
    act(() => {
      api().selectFileWithModifiers(mouseEvent({ shiftKey: true }), "c.md");
    });

    expect([...api().selected]).toEqual(["a.md", "b.md", "c.md"]);
    expect(api().anchor).toBe("a.md");
    expect(onSelectFile).not.toHaveBeenCalled();
  });

  it("shift-click without a visible anchor falls back to single select", () => {
    const onSelectFile = vi.fn();
    const { api } = renderSelection(onSelectFile);

    act(() => {
      api().selectFileWithModifiers(mouseEvent({ shiftKey: true }), "c.md");
    });

    expect([...api().selected]).toEqual(["c.md"]);
    expect(onSelectFile).toHaveBeenCalledWith("c.md");
  });

  it("meta-click toggles files without navigating", () => {
    const onSelectFile = vi.fn();
    const { api } = renderSelection(onSelectFile);

    act(() => {
      api().selectFileWithModifiers(mouseEvent(), "a.md");
    });
    onSelectFile.mockClear();
    act(() => {
      api().selectFileWithModifiers(mouseEvent({ metaKey: true }), "c.md");
    });

    expect([...api().selected].sort()).toEqual(["a.md", "c.md"]);
    expect(onSelectFile).not.toHaveBeenCalled();

    act(() => {
      api().selectFileWithModifiers(mouseEvent({ ctrlKey: true }), "a.md");
    });

    expect([...api().selected]).toEqual(["c.md"]);
    expect(onSelectFile).not.toHaveBeenCalled();
  });
});
