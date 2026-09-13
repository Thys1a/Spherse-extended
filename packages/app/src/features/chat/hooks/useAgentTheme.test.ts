import { describe, expect, it } from "vitest";
import { scopeAgentThemeCss, rewriteThemeAssetUrls, prepareAgentThemeCss } from "./useAgentTheme";

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

  it("keeps @font-face and @keyframes selectors global", () => {
    const fontFace = `@font-face { font-family: x; }`;
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

describe("rewriteThemeAssetUrls", () => {
  const previewUrl = (p: string) => `http://localhost:5173/api/projects/p1/preview/${p}`;
  const themeDir = ".spherse/agents/冥想盆-e14db4";

  it("rewrites a relative avatar url against the theme dir", () => {
    const out = rewriteThemeAssetUrls(
      `.a { background: url(../../../杂物箱/avatar.png) center/cover no-repeat; }`,
      themeDir,
      previewUrl,
    );
    expect(out).toContain('url("http://localhost:5173/api/projects/p1/preview/杂物箱/avatar.png")');
  });

  it("handles quoted, ./, and bare urls", () => {
    expect(
      rewriteThemeAssetUrls(`.a { background: url("./bg.png"); }`, themeDir, previewUrl),
    ).toContain(`url("http://localhost:5173/api/projects/p1/preview/.spherse/agents/冥想盆-e14db4/bg.png")`);
    expect(
      rewriteThemeAssetUrls(`.a { background: url(bg.png); }`, themeDir, previewUrl),
    ).toContain(`url("http://localhost:5173/api/projects/p1/preview/.spherse/agents/冥想盆-e14db4/bg.png")`);
    expect(
      rewriteThemeAssetUrls(`.a { background: url('../shared/x.png'); }`, themeDir, previewUrl),
    ).toContain(`url("http://localhost:5173/api/projects/p1/preview/.spherse/agents/shared/x.png")`);
  });

  it("skips data:, remote, absolute, and hash urls", () => {
    const css = `.a { background: url(data:image/png;base64,xx); }
.b { background: url(https://example.com/x.png); }
.c { background: url(/x.png); }
.d { mask: url(#hash); }`;
    expect(rewriteThemeAssetUrls(css, themeDir, previewUrl)).toBe(css);
  });

  it("keeps urls escaping the project root untouched", () => {
    const css = `.a { background: url(../../../../../../etc/passwd); }`;
    expect(rewriteThemeAssetUrls(css, themeDir, previewUrl)).toBe(css);
  });

  it("rewrites font urls inside @font-face", () => {
    const out = rewriteThemeAssetUrls(
      `@font-face { font-family: x; src: url(fonts/a.woff2); }`,
      themeDir,
      previewUrl,
    );
    expect(out).toContain(`url("http://localhost:5173/api/projects/p1/preview/.spherse/agents/冥想盆-e14db4/fonts/a.woff2")`);
  });

  it("preserves query and fragment suffixes outside the resolved path", () => {
    expect(
      rewriteThemeAssetUrls(`.a { background: url(bg.png?v=2); }`, themeDir, previewUrl),
    ).toContain(`url("http://localhost:5173/api/projects/p1/preview/.spherse/agents/冥想盆-e14db4/bg.png?v=2")`);
    expect(
      rewriteThemeAssetUrls(`.a { src: url(fonts/a.woff2#iefix); }`, themeDir, previewUrl),
    ).toContain(`url("http://localhost:5173/api/projects/p1/preview/.spherse/agents/冥想盆-e14db4/fonts/a.woff2#iefix")`);
  });

  it("leaves empty and dot-only urls untouched", () => {
    expect(rewriteThemeAssetUrls(`.a { background: url(); }`, themeDir, previewUrl)).toContain("url()");
    expect(rewriteThemeAssetUrls(`.a { background: url(.); }`, themeDir, previewUrl)).toContain("url(.)");
  });
});

describe("prepareAgentThemeCss", () => {
  const previewUrl = (p: string) => `http://localhost:5173/api/projects/p1/preview/${p}`;

  it("returns empty string for empty css", () => {
    expect(prepareAgentThemeCss("", "s1", ".spherse/agents/a", previewUrl)).toBe("");
  });

  it("scopes without rewriting when themeDir or previewUrl is missing", () => {
    const css = `.a { background: url(bg.png); }`;
    expect(prepareAgentThemeCss(css, "s1")).toContain('[data-chat-instance="s1"] .a');
    expect(prepareAgentThemeCss(css, "s1")).toContain("url(bg.png)");
    expect(prepareAgentThemeCss(css, "s1", ".spherse/agents/a")).toContain("url(bg.png)");
  });

  it("rewrites then scopes when all inputs are present", () => {
    const out = prepareAgentThemeCss(
      `.a { background: url(bg.png); }`,
      "s1",
      ".spherse/agents/a",
      previewUrl,
    );
    expect(out).toContain('[data-chat-instance="s1"] .a');
    expect(out).toContain("url(\"http://localhost:5173/api/projects/p1/preview/.spherse/agents/a/bg.png\")");
  });
});
