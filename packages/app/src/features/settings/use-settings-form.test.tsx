import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomProviderDef, SamplingParams } from "@spherse/core";
import type { AppSettings, ModelSettingsApi, SettingsApi } from "./types";
import { useSettingsForm } from "./use-settings-form";

function createApi(overrides: { settings?: AppSettings | null } = {}): SettingsApi {
  return {
    getSettings: vi.fn(async () => overrides.settings ?? null),
    saveSettings: vi.fn(async () => ({ success: true })),
    getSupportedProviders: vi.fn(async () => ({ "builtin-x": {} as never })),
    getImageProviders: vi.fn(async () => ({ "img-x": {} as never })),
  };
}

function lastSaved(api: SettingsApi): { text?: { sampling?: SamplingParams; thinkingLevel?: string }; image?: { sampling?: SamplingParams; thinkingLevel?: string }; customProviders?: CustomProviderDef[] } {
  const calls = (api.saveSettings as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0].models;
}

let api: SettingsApi;

beforeEach(() => {
  api = createApi({
    settings: {
      models: {
        text: {
          defaultModel: "builtin-x/m1",
          providers: { "builtin-x": { apiKey: "stored-key" } },
          sampling: { temperature: 0.5 },
          thinkingLevel: "low",
        },
        image: { defaultModel: "img-x/i1", providers: {} },
      },
      customProviders: [{ id: "custom-old", name: "Old", baseUrl: "https://old.example", models: ["m"], keyless: false }],
    },
  });
});

describe("useSettingsForm init", () => {
  it("reads text sampling, thinkingLevel and api keys from settings on init", async () => {
    const { result } = renderHook(() => useSettingsForm(api));
    await waitFor(() => {
      expect(result.current.text.sampling).toEqual({ temperature: 0.5 });
      expect(result.current.text.thinkingLevel).toBe("low");
      expect(result.current.text.apiKeys["builtin-x"]).toBe("stored-key");
    });
  });

  it("does not read sampling or thinkingLevel from the image group", async () => {
    const { result } = renderHook(() => useSettingsForm(api));
    await waitFor(() => expect(result.current.image.apiKeys).toBeDefined());
    expect(result.current.image.sampling).toBeUndefined();
    expect(result.current.image.thinkingLevel).toBeUndefined();
  });

  it("reads customProviders from settings on init", async () => {
    const { result } = renderHook(() => useSettingsForm(api));
    await waitFor(() => expect(result.current.text.customProviders).toHaveLength(1));
  });
});

describe("useSettingsForm save payload", () => {
  it("persists a sampling patch immediately and merges it into the text group only", async () => {
    const { result } = renderHook(() => useSettingsForm(api));
    await waitFor(() => expect(result.current.text.sampling).toEqual({ temperature: 0.5 }));

    let ok = false;
    await act(async () => {
      ok = await result.current.text.patchSampling({ topP: 0.9 });
    });
    expect(ok).toBe(true);
    expect(result.current.text.sampling).toEqual({ temperature: 0.5, topP: 0.9 });
    expect(lastSaved(api).text?.sampling).toEqual({ temperature: 0.5, topP: 0.9 });
    expect(lastSaved(api).image?.sampling).toBeUndefined();
  });

  it("clears sampling when the merge leaves all params undefined", async () => {
    const { result } = renderHook(() => useSettingsForm(api));
    await waitFor(() => expect(result.current.text.sampling).toEqual({ temperature: 0.5 }));

    await act(async () => {
      await result.current.text.patchSampling({ temperature: undefined });
    });
    expect(result.current.text.sampling).toEqual({});
    expect(lastSaved(api).text?.sampling).toEqual({});
  });

  it("persists thinkingLevel changes on the text group only", async () => {
    const { result } = renderHook(() => useSettingsForm(api));
    await waitFor(() => expect(result.current.text.thinkingLevel).toBe("low"));

    await act(async () => {
      await result.current.text.changeThinkingLevel("high");
    });
    expect(result.current.text.thinkingLevel).toBe("high");
    expect(lastSaved(api).text?.thinkingLevel).toBe("high");
    expect(lastSaved(api).image?.thinkingLevel).toBeUndefined();
  });

  it("commitApiKey persists the key through saveSettings, not only local state", async () => {
    const { result } = renderHook(() => useSettingsForm(api));
    await waitFor(() => expect(result.current.text.apiKeys["builtin-x"]).toBe("stored-key"));

    await act(async () => {
      result.current.text.commitApiKey("builtin-x", "new-key");
    });
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalled());
    const saved = (api.saveSettings as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(saved.models.text.providers["builtin-x"]).toEqual({ apiKey: "new-key" });
  });
});

describe("useSettingsForm disconnect", () => {
  it("preserves sampling when disconnecting a provider and clears its model default", async () => {
    const { result } = renderHook(() => useSettingsForm(api));
    await waitFor(() => expect(result.current.text.sampling).toEqual({ temperature: 0.5 }));

    let ok = false;
    await act(async () => {
      ok = await result.current.text.disconnect("builtin-x");
    });
    expect(ok).toBe(true);
    expect(result.current.text.apiKeys["builtin-x"]).toBe("");
    expect(result.current.text.sampling).toEqual({ temperature: 0.5 });
    const saved = (api.saveSettings as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(saved.models.text.sampling).toEqual({ temperature: 0.5 });
    expect(saved.models.text.defaultModel).toBe("");
  });
});

describe("useSettingsForm custom providers", () => {
  it("addCustomProvider generates an id, saves and refreshes the catalog", async () => {
    const { result } = renderHook(() => useSettingsForm(api));
    await waitFor(() => expect(result.current.text.customProviders).toHaveLength(1));

    let ok = false;
    await act(async () => {
      ok = await result.current.text.addCustomProvider!({ id: "", name: "New", baseUrl: "https://new.example", models: ["m"], keyless: false });
    });
    expect(ok).toBe(true);
    const saved = (api.saveSettings as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    const added = saved.customProviders.find((c: { name: string }) => c.name === "New")!;
    expect(added.id).toBeTruthy();
    expect(added.id).not.toBe("custom-old");
    expect(api.getSupportedProviders).toHaveBeenCalledTimes(2);
  });

  it("updateCustomProvider keeps the id stable", async () => {
    const { result } = renderHook(() => useSettingsForm(api));
    await waitFor(() => expect(result.current.text.customProviders).toHaveLength(1));

    await act(async () => {
      await result.current.text.updateCustomProvider!("custom-old", { id: "ignored", name: "Renamed", baseUrl: "https://new.example", models: ["m"], keyless: false });
    });
    const saved = (api.saveSettings as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(saved.customProviders).toEqual([{ id: "custom-old", name: "Renamed", baseUrl: "https://new.example", models: ["m"], keyless: false }]);
  });

  it("removeCustomProvider clears the apiKey and defaultModel referencing the provider", async () => {
    const settings = {
      models: {
        text: {
          defaultModel: "custom-old/m1",
          providers: { "custom-old": { apiKey: "k" } },
          sampling: { temperature: 0.5 },
        },
        image: { defaultModel: "", providers: {} },
      },
      customProviders: [{ id: "custom-old", name: "Old", baseUrl: "https://old.example", models: ["m"], keyless: false }],
    };
    api = createApi({ settings: settings as AppSettings });
    const { result } = renderHook(() => useSettingsForm(api));
    await waitFor(() => expect(result.current.text.customProviders).toHaveLength(1));

    await act(async () => {
      await result.current.text.removeCustomProvider!("custom-old");
    });
    const saved = (api.saveSettings as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(saved.customProviders).toEqual([]);
    expect(saved.models.text.providers["custom-old"]).toBeUndefined();
    expect(saved.models.text.defaultModel).toBe("");
    expect(saved.models.text.sampling).toEqual({ temperature: 0.5 });
  });

  it("does not expose custom provider methods on the image group", async () => {
    const { result } = renderHook(() => useSettingsForm(api));
    await waitFor(() => expect(result.current.image.apiKeys).toBeDefined());
    expect(result.current.image.addCustomProvider).toBeUndefined();
    expect(result.current.image.updateCustomProvider).toBeUndefined();
    expect(result.current.image.removeCustomProvider).toBeUndefined();
  });
});

describe("useSettingsForm rest mode", () => {
  function createModelApi(): ModelSettingsApi {
    return {
      getModelSettings: vi.fn(async () => ({
        models: {
          text: {
            defaultModel: "builtin-x/m1",
            providers: { "builtin-x": { configured: true }, "builtin-y": { configured: false } },
            sampling: { temperature: 0.5 },
          },
          image: { defaultModel: "", providers: {} },
        },
        customProviders: [],
      })),
      updateModelSettings: vi.fn(async (req) => ({
        models: {
          text: {
            defaultModel: req.models.text.defaultModel,
            providers: { "builtin-x": { configured: true } },
            sampling: req.models.text.sampling,
          },
          image: { defaultModel: "", providers: {} },
        },
        customProviders: req.customProviders ?? [],
      })),
      getSupportedProviders: vi.fn(async () => ({ "builtin-x": {} as never, "builtin-y": {} as never })),
      getImageProviders: vi.fn(async () => ({ "img-x": {} as never })),
    };
  }

  it("surfaces configured flags and leaves apiKeys empty", async () => {
    const modelApi = createModelApi();
    const { result } = renderHook(() => useSettingsForm(api, modelApi));
    await waitFor(() => expect(result.current.text.configured).toEqual({ "builtin-x": true }));

    expect(result.current.text.defaultModel).toBe("builtin-x/m1");
    expect(result.current.text.sampling).toEqual({ temperature: 0.5 });
    expect(result.current.text.apiKeys).toEqual({});
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it("sends key deltas through PUT and refreshes configured flags", async () => {
    const modelApi = createModelApi();
    const { result } = renderHook(() => useSettingsForm(api, modelApi));
    await waitFor(() => expect(result.current.text.configured).toEqual({ "builtin-x": true }));

    let ok = false;
    await act(async () => {
      ok = await result.current.text.patchSampling({ topP: 0.9 });
    });
    expect(ok).toBe(true);
    expect(modelApi.updateModelSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        models: expect.objectContaining({
          text: expect.objectContaining({
            providers: {},
            sampling: { temperature: 0.5, topP: 0.9 },
          }),
        }),
      }),
    );
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it("disconnect sends a blank key through PUT", async () => {
    const modelApi = createModelApi();
    const { result } = renderHook(() => useSettingsForm(api, modelApi));
    await waitFor(() => expect(result.current.text.configured).toEqual({ "builtin-x": true }));

    await act(async () => {
      await result.current.text.disconnect("builtin-x");
    });
    expect(modelApi.updateModelSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        models: expect.objectContaining({
          text: expect.objectContaining({ providers: { "builtin-x": { apiKey: "" } } }),
        }),
      }),
    );
  });

  it("falls back to bridge reads when the rest call fails", async () => {
    const modelApi = createModelApi();
    vi.mocked(modelApi.getModelSettings).mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useSettingsForm(api, modelApi));
    await waitFor(() => expect(result.current.text.apiKeys["builtin-x"]).toBe("stored-key"));

    expect(result.current.text.configured).toEqual({});
  });

  it("refuses custom provider writes only when the rest call fails", async () => {
    const modelApi = createModelApi();
    const { result } = renderHook(() => useSettingsForm(api, modelApi));
    await waitFor(() => expect(result.current.text.configured).toEqual({ "builtin-x": true }));

    let ok = false;
    await act(async () => {
      ok = await result.current.text.addCustomProvider!({ id: "", name: "New", baseUrl: "https://new.example", models: ["m"], keyless: false });
    });
    expect(ok).toBe(true);
    expect(modelApi.updateModelSettings).toHaveBeenCalled();
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it("connect persists a typed key without a prior commit", async () => {
    const modelApi = createModelApi();
    const { result } = renderHook(() => useSettingsForm(api, modelApi));
    await waitFor(() => expect(result.current.text.configured).toEqual({ "builtin-x": true }));

    await act(async () => {
      result.current.text.setApiKey("builtin-y", "sk-y");
    });
    let ok = false;
    await act(async () => {
      ok = await result.current.text.connect("builtin-y");
    });
    expect(ok).toBe(true);
    expect(modelApi.updateModelSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        models: expect.objectContaining({
          text: expect.objectContaining({ providers: { "builtin-y": { apiKey: "sk-y" } } }),
        }),
      }),
    );
  });

  it("syncs corrected meta fields from the PUT response", async () => {
    const modelApi = createModelApi();
    vi.mocked(modelApi.updateModelSettings).mockResolvedValueOnce({
      models: {
        text: { defaultModel: "builtin-x/m1", providers: { "builtin-x": { configured: true } } },
        image: { defaultModel: "", providers: {} },
      },
      customProviders: [],
    });
    const { result } = renderHook(() => useSettingsForm(api, modelApi));
    await waitFor(() => expect(result.current.text.configured).toEqual({ "builtin-x": true }));

    await act(async () => {
      await result.current.text.patchSampling({ topP: 0.9 });
    });
    expect(result.current.text.sampling).toBeUndefined();
    expect(result.current.text.thinkingLevel).toBeUndefined();
  });

  it("clears disconnect state when reconnecting the same key", async () => {
    const modelApi = createModelApi();
    const { result } = renderHook(() => useSettingsForm(api, modelApi));
    await waitFor(() => expect(result.current.text.configured).toEqual({ "builtin-x": true }));

    await act(async () => {
      await result.current.text.disconnect("builtin-x");
    });
    await act(async () => {
      result.current.text.setApiKey("builtin-x", "sk-again");
    });
    await act(async () => {
      await result.current.text.connect("builtin-x");
    });
    const last = vi.mocked(modelApi.updateModelSettings).mock.calls.at(-1)![0];
    expect(last.models.text.providers).toEqual({ "builtin-x": { apiKey: "sk-again" } });
  });

  it("sends a blank delete signal when removing a custom provider", async () => {
    const modelApi = createModelApi();
    const { result } = renderHook(() => useSettingsForm(api, modelApi));
    await waitFor(() => expect(result.current.text.configured).toEqual({ "builtin-x": true }));

    let addedId = "";
    await act(async () => {
      await result.current.text.addCustomProvider!({ id: "", name: "Gone", baseUrl: "https://gone.example", models: ["m"], keyless: false });
    });
    const added = vi.mocked(modelApi.updateModelSettings).mock.calls.at(-1)![0];
    addedId = added.customProviders!.find((c: { name: string }) => c.name === "Gone")!.id;
    await act(async () => {
      await result.current.text.removeCustomProvider!(addedId);
    });
    const last = vi.mocked(modelApi.updateModelSettings).mock.calls.at(-1)![0];
    expect(last.models.text.providers![addedId]).toEqual({ apiKey: "" });
    expect(last.customProviders!.find((c: { id: string }) => c.id === addedId)).toBeUndefined();
  });
});
