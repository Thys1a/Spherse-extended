import { describe, expect, it } from "vitest";
import { scopeAgentThemeCss } from "./useAgentTheme";

const SCOPE = '[data-chat-instance="s1"]';

describe("scopeAgentThemeCss", () => {
  it("prefixes plain selectors with the instance scope", () => {
    const out = scopeAgentThemeCss(`[data-chat-messages] { color: red; }`, "s1");
    expect(out).toContain(`${SCOPE} [data-chat-messages]`);
  });

  it("prefixes each selector in a comma list", () => {
    const out = scopeAgentThemeCss(`.a, .b { color: red; }`, "s1");
    expect(out).toContain(`${SCOPE} .a, ${SCOPE} .b`);
  });

  it("rewrites :root, html and body to the scope", () => {
    expect(scopeAgentThemeCss(`:root { --x: 1; }`, "s1")).toContain(`${SCOPE} {`);
    expect(scopeAgentThemeCss(`body { margin: 0; }`, "s1")).toContain(`${SCOPE} {`);
    expect(scopeAgentThemeCss(`html { padding: 0; }`, "s1")).toContain(`${SCOPE} {`);
  });

  it("does not rewrite selectors that merely start with those names", () => {
    const out = scopeAgentThemeCss(`.body-text { color: red; }`, "s1");
    expect(out).toContain(`${SCOPE} .body-text`);
  });

  it("recurses into @media blocks", () => {
    const out = scopeAgentThemeCss(
      `@media (prefers-color-scheme: dark) { [data-chat-messages] { color: white; } }`,
      "s1",
    );
    expect(out).toContain("@media (prefers-color-scheme: dark)");
    expect(out).toContain(`${SCOPE} [data-chat-messages]`);
  });

  it("keeps @font-face and @keyframes global", () => {
    const fontFace = `@font-face { font-family: x; src: url(a.woff); }`;
    expect(scopeAgentThemeCss(fontFace, "s1")).toBe(fontFace);
    const keyframes = `@keyframes spin { to { transform: rotate(360deg); } }`;
    expect(scopeAgentThemeCss(keyframes, "s1")).toBe(keyframes);
  });

  it("returns empty string for empty input", () => {
    expect(scopeAgentThemeCss("", "s1")).toBe("");
    expect(scopeAgentThemeCss("  ", "s1")).toBe("");
  });

  it("resolves & against the scope", () => {
    const out = scopeAgentThemeCss(`&.open { color: red; }`, "s1");
    expect(out).toContain(`${SCOPE}.open`);
  });

  it("rewrites template-style [data-chat-root] nesting to a compound selector", () => {
    const out = scopeAgentThemeCss(
      `[data-chat-root] { --x: 1; [data-chat-messages] { color: red; } }`,
      "s1",
    );
    expect(out).toContain(`[data-chat-root]${SCOPE}`);
    expect(out).not.toContain(`${SCOPE} [data-chat-root]`);
  });

  it("keeps [data-chat-float-root] global because it is an ancestor of the instance", () => {
    const out = scopeAgentThemeCss(`[data-chat-float-root] { border-radius: 8px; }`, "s1");
    expect(out).toContain("[data-chat-float-root]");
    expect(out).not.toContain(SCOPE);
  });

  it("tolerates unbalanced braces without dropping the whole sheet", () => {
    const out = scopeAgentThemeCss(`.a { color: red; } } .b { color: blue; }`, "s1");
    expect(out).toContain(`${SCOPE} .b`);
  });

  it("escapes the instance id and style-closing tags", () => {
    const out = scopeAgentThemeCss(`.a { content: "</style>"; }`, 's1"x');
    expect(out).toContain('[data-chat-instance="s1\\"x"]');
    expect(out).not.toMatch(/<\/style/i);
  });
});
