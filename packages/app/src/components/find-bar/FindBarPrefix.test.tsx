import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { FindBar } from "./FindBar";

vi.mock("@spherse/i18n/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@spherse/i18n/react")>();
  return {
    ...mod,
    useI18n: () => ({
      t: (key: string) => key,
      locale: "zh-CN",
    }),
  };
});

function Harness({ labelPrefix }: { labelPrefix?: "content-browser.find" | "chat.find" }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  return (
    <div>
      <div ref={containerRef}>
        <pre>foo bar foo</pre>
      </div>
      <FindBar
        containerRef={containerRef}
        contentKey="k"
        onClose={() => {}}
        labelPrefix={labelPrefix}
      />
    </div>
  );
}

function barTitles(): (string | null)[] {
  const bar = document.querySelector("[data-find-bar]");
  if (!bar) throw new Error("find bar not rendered");
  return Array.from(bar.querySelectorAll("button")).map((button) =>
    button.getAttribute("title"),
  );
}

describe("FindBar labelPrefix", () => {
  it("uses content-browser.find keys by default", () => {
    render(<Harness />);
    expect(screen.getByPlaceholderText("content-browser.find.placeholder")).toBeInTheDocument();
    expect(barTitles()).toEqual([
      "content-browser.find.previous",
      "content-browser.find.next",
      "content-browser.find.close",
    ]);
  });

  it("uses chat.find keys when labelPrefix is chat.find", () => {
    render(<Harness labelPrefix="chat.find" />);
    expect(screen.getByPlaceholderText("chat.find.placeholder")).toBeInTheDocument();
    expect(barTitles()).toEqual([
      "chat.find.previous",
      "chat.find.next",
      "chat.find.close",
    ]);
  });
});
