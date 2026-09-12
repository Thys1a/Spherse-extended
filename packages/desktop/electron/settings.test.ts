import { beforeEach, describe, expect, it, vi } from "vitest";

const storeData: Record<string, unknown> = {};

vi.mock("electron", () => ({
  nativeTheme: { themeSource: "" },
}));

vi.mock("electron-store", () => ({
  default: class {
    get(key: string): unknown {
      return storeData[key];
    }
    set(key: string, value: unknown): void {
      storeData[key] = value;
    }
  },
}));

vi.mock("./model-catalog.js", () => ({
  getAppModelCatalog: () => ({
    getSupportedProviders: () => ({}),
    syncCustomProviders: () => {},
  }),
}));

import { getMaskedSettings, saveSettings } from "./settings.js";

function fullSettings() {
  return {
    locale: "zh-CN",
    models: {
      text: { defaultModel: "", providers: {} },
      image: { defaultModel: "", providers: {} },
    },
  };
}

describe("notification settings persistence", () => {
  beforeEach(() => {
    for (const key of Object.keys(storeData)) delete storeData[key];
  });

  it("round-trips notification prefs through save and masked read", () => {
    saveSettings({ ...fullSettings(), notifications: { approval: false } } as never);
    expect(getMaskedSettings()?.notifications).toEqual({ approval: false });
  });

  it("preserves notification prefs across partial saves", () => {
    saveSettings({ ...fullSettings(), notifications: { trigger: false } } as never);
    saveSettings({ ...fullSettings() } as never);
    expect(getMaskedSettings()?.notifications).toEqual({ trigger: false });
  });
});
