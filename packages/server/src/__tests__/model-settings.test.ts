import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ModelSettingsStore } from "../model-settings.js";

describe("ModelSettingsStore", () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-model-settings-"));
    filePath = path.join(tmpDir, "model-settings.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty defaults without a file", () => {
    const store = new ModelSettingsStore();
    expect(store.get()).toEqual({
      text: { defaultModel: "", providers: {} },
      image: { defaultModel: "", providers: {} },
      customProviders: [],
    });
  });

  it("returns empty defaults for missing or corrupt files", () => {
    const missing = new ModelSettingsStore({ filePath: path.join(tmpDir, "nope.json") });
    expect(missing.get().text.defaultModel).toBe("");

    fs.writeFileSync(filePath, "not json{{{", "utf-8");
    const corrupt = new ModelSettingsStore({ filePath });
    expect(corrupt.get().text.defaultModel).toBe("");
  });

  it("normalizes blank keys away on update and persists atomically", () => {
    const store = new ModelSettingsStore({ filePath });
    const next = store.applyUpdate({
      models: {
        text: { defaultModel: "openai/gpt-4o", providers: { openai: { apiKey: "sk-1" }, empty: { apiKey: "  " } } },
        image: { defaultModel: "", providers: {} },
      },
      customProviders: [],
    });

    expect(next.text.providers).toEqual({ openai: { apiKey: "sk-1" } });
    expect(fs.existsSync(filePath)).toBe(true);

    const reloaded = new ModelSettingsStore({ filePath });
    expect(reloaded.get()).toEqual(next);
  });

  it("keeps previous keys on undefined and deletes on blank", () => {
    const store = new ModelSettingsStore({ filePath });
    store.applyUpdate({
      models: {
        text: { defaultModel: "m", providers: { a: { apiKey: "k1" }, b: { apiKey: "k2" } } },
        image: { defaultModel: "", providers: {} },
      },
    });

    const next = store.applyUpdate({
      models: {
        text: { defaultModel: "m", providers: { b: { apiKey: "" } } },
        image: { defaultModel: "", providers: {} },
      },
    });
    expect(next.text.providers).toEqual({ a: { apiKey: "k1" } });
  });

  it("sanitizes keys to configured flags", () => {
    const store = new ModelSettingsStore();
    store.applyUpdate({
      models: {
        text: { defaultModel: "openai/gpt-4o", providers: { openai: { apiKey: "sk-1" } }, sampling: { temperature: 0.5 } },
        image: { defaultModel: "", providers: {} },
      },
      customProviders: [{ id: "c1", name: "C", baseUrl: "http://x", models: ["m"], keyless: false }],
    });

    expect(store.sanitize()).toEqual({
      models: {
        text: {
          defaultModel: "openai/gpt-4o",
          providers: { openai: { configured: true } },
          sampling: { temperature: 0.5 },
          thinkingLevel: undefined,
        },
        image: { defaultModel: "", providers: {} },
      },
      customProviders: [{ id: "c1", name: "C", baseUrl: "http://x", models: ["m"], keyless: false }],
    });
  });

  it("strips custom provider headers from sanitized output", () => {
    const store = new ModelSettingsStore();
    store.applyUpdate({
      models: { text: { defaultModel: "", providers: {} }, image: { defaultModel: "", providers: {} } },
      customProviders: [
        { id: "c1", name: "C", baseUrl: "http://x", models: ["m"], keyless: false, headers: { Authorization: "Bearer sk-x" } },
      ],
    });

    const sanitized = store.sanitize();
    expect(sanitized.customProviders).toEqual([
      { id: "c1", name: "C", baseUrl: "http://x", models: ["m"], keyless: false },
    ]);
    expect("headers" in sanitized.customProviders[0]).toBe(false);
    expect(store.get().customProviders[0]).toMatchObject({ headers: { Authorization: "Bearer sk-x" } });
  });

  it("normalizes dirty sampling and thinkingLevel instead of failing reads", () => {
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        text: { defaultModel: "m", providers: {}, sampling: { temperature: "hot" }, thinkingLevel: "ultra" },
        image: { defaultModel: "", providers: {}, sampling: { topP: 0.5 }, thinkingLevel: "low" },
        customProviders: [],
      }),
      "utf-8",
    );
    const store = new ModelSettingsStore({ filePath });

    expect(store.get().text.sampling).toBeUndefined();
    expect(store.get().text.thinkingLevel).toBeUndefined();
    expect(store.get().image).toEqual({ defaultModel: "", providers: {} });
    expect(() => store.sanitize()).not.toThrow();
  });
});
