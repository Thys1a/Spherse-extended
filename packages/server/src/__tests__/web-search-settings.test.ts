import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSearchSettingsStore } from "../web-search-settings.js";

describe("WebSearchSettingsStore", () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-web-search-"));
    filePath = path.join(tmpDir, "web-search-settings.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty defaults without a file", () => {
    expect(new WebSearchSettingsStore().get()).toEqual({});
  });

  it("normalizes blank fields away and persists atomically", () => {
    const store = new WebSearchSettingsStore({ filePath });
    const next = store.applyUpdate({ apiKey: "sk-1", baseUrl: "https://x.example  ", model: "  " });
    expect(next).toEqual({ apiKey: "sk-1", baseUrl: "https://x.example" });

    const reloaded = new WebSearchSettingsStore({ filePath });
    expect(reloaded.get()).toEqual(next);
  });

  it("keeps previous fields on undefined and clears on null", () => {
    const store = new WebSearchSettingsStore({ filePath });
    store.applyUpdate({ apiKey: "sk-1", baseUrl: "https://x.example", model: "m" });

    const next = store.applyUpdate({ baseUrl: null });
    expect(next).toEqual({ apiKey: "sk-1", model: "m" });
  });

  it("sanitizes the key to a configured flag", () => {
    const store = new WebSearchSettingsStore();
    store.applyUpdate({ apiKey: "sk-1", baseUrl: "https://x.example" });
    expect(store.sanitize()).toEqual({
      apiKey: { configured: true },
      baseUrl: "https://x.example",
      model: null,
    });
    expect(JSON.stringify(store.sanitize())).not.toContain("sk-1");
  });
});
