import { describe, expect, it } from "vitest";
import type { ProviderCatalogItem } from "@spherse/core";
import { resolveModelContextWindow } from "./model-catalog";

const catalog: Record<string, ProviderCatalogItem> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    auth: { type: "apiKey", envKeys: ["OPENAI_API_KEY"] },
    models: [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        api: "openai",
        reasoning: false,
        input: ["text"],
        contextWindow: 128000,
      },
    ],
  },
  custom: {
    id: "custom",
    name: "Custom",
    auth: { type: "unknown", envKeys: [] },
    models: [
      {
        id: "m1",
        name: "M1",
        provider: "custom",
        api: "openai",
        reasoning: false,
        input: ["text"],
      },
    ],
  },
};

describe("resolveModelContextWindow", () => {
  it("resolves provider-qualified model ids", () => {
    expect(resolveModelContextWindow("openai/gpt-4o", catalog)).toBe(128000);
    expect(resolveModelContextWindow("openai/gpt-5", catalog)).toBeUndefined();
    expect(resolveModelContextWindow("unknown/gpt-4o", catalog)).toBeUndefined();
  });

  it("resolves bare model ids across all providers", () => {
    expect(resolveModelContextWindow("gpt-4o", catalog)).toBe(128000);
    expect(resolveModelContextWindow("not-a-model", catalog)).toBeUndefined();
  });

  it("returns undefined without a window or model", () => {
    expect(resolveModelContextWindow("custom/m1", catalog)).toBeUndefined();
    expect(resolveModelContextWindow(undefined, catalog)).toBeUndefined();
    expect(resolveModelContextWindow("openai/gpt-4o", {})).toBeUndefined();
  });
});
