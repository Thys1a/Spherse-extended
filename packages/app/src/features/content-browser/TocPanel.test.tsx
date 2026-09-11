import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { translate } from "@spherse/i18n";
import { renderWithProviders } from "../../test/render";
import { TocPanel } from "./TocPanel";
import { useContentToc } from "./useContentToc";

function HookHarness({ enabled, docKey = "k" }: { enabled: boolean; docKey?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const entries = useContentToc(ref, docKey, enabled);
  return (
    <div ref={ref}>
      <div data-content-doc>
        <h1 id="title">Title</h1>
        <h2 id="section">Section</h2>
        <h3>Without id</h3>
        <h2 id="section-2">Second</h2>
      </div>
      <ul>
        {entries.map((e, idx) => (
          <li key={`${e.id}#${idx}`} data-testid="toc-entry">
            {e.level}:{e.id}:{e.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe("useContentToc", () => {
  it("extracts h1/h2/h3 with ids and skips headings without id", () => {
    renderWithProviders(<HookHarness enabled />);

    const items = screen.getAllByTestId("toc-entry").map((el) => el.textContent);
    expect(items).toEqual(["1:title:Title", "2:section:Section", "2:section-2:Second"]);
  });

  it("returns empty entries when disabled", () => {
    renderWithProviders(<HookHarness enabled={false} />);

    expect(screen.queryByTestId("toc-entry")).toBeNull();
  });
});

describe("TocPanel", () => {
  it("renders the title and scrolls to the heading on click", () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const root = document.createElement("div");
    root.innerHTML = `<div data-content-doc><h2 id="section">Section</h2></div>`;
    document.body.appendChild(root);
    const containerRef = { current: root };

    renderWithProviders(
      <TocPanel entries={[{ id: "section", text: "Section", level: 2 }]} containerRef={containerRef} />,
    );

    expect(screen.getByText(translate("zh-CN", "content-browser.toc.title"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Section" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    document.body.removeChild(root);
  });
});
