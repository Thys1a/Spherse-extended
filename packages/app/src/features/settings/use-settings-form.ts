import { useEffect, useState, useCallback } from "react";
import type { CustomProviderDef, SamplingParams, ThinkingLevel } from "@spherse/core";
import type { ModelSettingsResponse } from "../../lib/types";
import type { ProviderConfig, SettingsApi, ModelSettingsApi } from "./types";
import { generateCustomProviderId } from "./custom-provider-id.js";

interface GroupFormState {
  providers: Record<string, ProviderConfig>;
  apiKeys: Record<string, string>;
  configured: Record<string, boolean>;
  defaultModel: string;
  sampling?: SamplingParams;
  thinkingLevel?: ThinkingLevel;
  setApiKey: (id: string, value: string) => void;
  commitApiKey: (id: string, value: string) => void;
  changeDefaultModel: (model: string) => Promise<boolean>;
  patchSampling: (params: SamplingParams) => Promise<boolean>;
  changeThinkingLevel: (level: ThinkingLevel | undefined) => Promise<boolean>;
  connect: (id: string) => Promise<boolean>;
  disconnect: (id: string) => Promise<boolean>;
  customProviders?: CustomProviderDef[];
  addCustomProvider?: (def: CustomProviderDef) => Promise<boolean>;
  updateCustomProvider?: (id: string, def: CustomProviderDef) => Promise<boolean>;
  removeCustomProvider?: (id: string) => Promise<boolean>;
}

export type { GroupFormState };

interface GroupData {
  apiKeys: Record<string, string>;
  configured: Record<string, boolean>;
  writes: Record<string, string>;
  clears: Record<string, true>;
  defaultModel: string;
  sampling?: SamplingParams;
  thinkingLevel?: ThinkingLevel;
}

const EMPTY_GROUP: GroupData = { apiKeys: {}, configured: {}, writes: {}, clears: {}, defaultModel: "" };

function providersPayload(group: GroupData): Record<string, { apiKey?: string }> {
  const providers: Record<string, { apiKey?: string }> = {};
  for (const [id, apiKey] of Object.entries(group.writes)) {
    if (apiKey.trim()) providers[id] = { apiKey };
  }
  for (const id of Object.keys(group.clears)) {
    if (!providers[id]) providers[id] = { apiKey: "" };
  }
  return providers;
}

function configuredFromFlags(providers: Record<string, { configured: boolean }>): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const [id, entry] of Object.entries(providers)) {
    if (entry.configured) map[id] = true;
  }
  return map;
}

function extractKeys(providers: Record<string, { apiKey?: string }> | undefined): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const [id, c] of Object.entries(providers ?? {})) {
    if (c?.apiKey) keys[id] = c.apiKey;
  }
  return keys;
}

function keysToProviders(keys: Record<string, string>): Record<string, { apiKey: string }> {
  const providers: Record<string, { apiKey: string }> = {};
  for (const [id, key] of Object.entries(keys)) {
    providers[id] = { apiKey: key };
  }
  return providers;
}

export function useSettingsForm(api: SettingsApi, modelApi: ModelSettingsApi | null = null) {
  const [textProviders, setTextProviders] = useState<Record<string, ProviderConfig>>({});
  const [imageProviders, setImageProviders] = useState<Record<string, ProviderConfig>>({});
  const [textData, setTextData] = useState<GroupData>({ ...EMPTY_GROUP });
  const [imageData, setImageData] = useState<GroupData>({ ...EMPTY_GROUP });
  const [saving, setSaving] = useState(false);
  const [customProviders, setCustomProviders] = useState<CustomProviderDef[]>([]);
  const [useRest, setUseRest] = useState(false);

  useEffect(() => {
    void (async () => {
      if (modelApi) {
        try {
          const [textCatalog, imageCatalog, settings] = await Promise.all([
            modelApi.getSupportedProviders(),
            modelApi.getImageProviders(),
            modelApi.getModelSettings(),
          ]);
          setTextProviders(textCatalog ?? {});
          setImageProviders(imageCatalog ?? {});
          setTextData({
            ...EMPTY_GROUP,
            configured: configuredFromFlags(settings.models.text.providers),
            defaultModel: settings.models.text.defaultModel ?? "",
            sampling: settings.models.text.sampling,
            thinkingLevel: settings.models.text.thinkingLevel,
          });
          setImageData({
            ...EMPTY_GROUP,
            configured: configuredFromFlags(settings.models.image.providers),
            defaultModel: settings.models.image.defaultModel ?? "",
          });
          setCustomProviders(settings.customProviders ?? []);
          setUseRest(true);
          return;
        } catch {
          setUseRest(false);
        }
      }
      const [textCatalog, imageCatalog, settings] = await Promise.all([
        api.getSupportedProviders(),
        api.getImageProviders(),
        api.getSettings(),
      ]);
      setTextProviders(textCatalog ?? {});
      setImageProviders(imageCatalog ?? {});
      setTextData({
        ...EMPTY_GROUP,
        apiKeys: extractKeys(settings?.models?.text?.providers),
        defaultModel: settings?.models?.text?.defaultModel ?? "",
        sampling: settings?.models?.text?.sampling,
        thinkingLevel: settings?.models?.text?.thinkingLevel,
      });
      setImageData({
        ...EMPTY_GROUP,
        apiKeys: extractKeys(settings?.models?.image?.providers),
        defaultModel: settings?.models?.image?.defaultModel ?? "",
      });
      setCustomProviders(settings?.customProviders ?? []);
    })();
  }, [api, modelApi]);

  const applyResponse = useCallback((response: ModelSettingsResponse) => {
    const configured = configuredFromFlags(response.models.text.providers);
    const imageConfigured = configuredFromFlags(response.models.image.providers);
    setTextData((prev) => ({
      ...prev,
      configured,
      apiKeys: {},
      writes: {},
      clears: {},
      defaultModel: response.models.text.defaultModel ?? prev.defaultModel,
      sampling: response.models.text.sampling,
      thinkingLevel: response.models.text.thinkingLevel,
    }));
    setImageData((prev) => ({
      ...prev,
      configured: imageConfigured,
      apiKeys: {},
      writes: {},
      clears: {},
      defaultModel: response.models.image.defaultModel ?? prev.defaultModel,
    }));
    setCustomProviders(response.customProviders ?? []);
  }, []);

  const save = useCallback(
    async (
      textOverride?: GroupData,
      imageOverride?: GroupData,
      customProvidersOverride?: CustomProviderDef[],
    ): Promise<boolean> => {
      const t = textOverride ?? textData;
      const i = imageOverride ?? imageData;
      const cp = customProvidersOverride ?? customProviders;
      setSaving(true);
      try {
        if (useRest && modelApi) {
          const response = await modelApi.updateModelSettings({
            models: {
              text: {
                defaultModel: t.defaultModel,
                providers: providersPayload(t),
                sampling: t.sampling,
                thinkingLevel: t.thinkingLevel,
              },
              image: {
                defaultModel: i.defaultModel,
                providers: providersPayload(i),
              },
            },
            customProviders: cp,
          });
          applyResponse(response);
          return true;
        }
        await api.saveSettings({
          models: {
            text: { defaultModel: t.defaultModel, providers: keysToProviders(t.apiKeys), sampling: t.sampling, thinkingLevel: t.thinkingLevel },
            image: { defaultModel: i.defaultModel, providers: keysToProviders(i.apiKeys) },
          },
          customProviders: cp,
        });
        return true;
      } catch {
        return false;
      } finally {
        setSaving(false);
      }
    },
    [api, modelApi, useRest, textData, imageData, customProviders, applyResponse],
  );

  const refreshTextCatalog = useCallback(async () => {
    const textCatalog = await api.getSupportedProviders();
    setTextProviders(textCatalog ?? {});
  }, [api]);

  const addCustomProvider = useCallback(
    async (def: CustomProviderDef): Promise<boolean> => {
      const existingIds = [...Object.keys(textProviders), ...customProviders.map((c) => c.id)];
      const id = generateCustomProviderId(def.name, existingIds);
      const withId = { ...def, id };
      const next = [...customProviders, withId];
      setCustomProviders(next);
      const ok = await save(undefined, undefined, next);
      if (ok) await refreshTextCatalog();
      return ok;
    },
    [textProviders, customProviders, save, refreshTextCatalog],
  );

  const updateCustomProvider = useCallback(
    async (id: string, def: CustomProviderDef): Promise<boolean> => {
      const next = customProviders.map((c) => (c.id === id ? { ...def, id } : c));
      setCustomProviders(next);
      const ok = await save(undefined, undefined, next);
      if (ok) await refreshTextCatalog();
      return ok;
    },
    [customProviders, save, refreshTextCatalog],
  );

  const removeCustomProvider = useCallback(
    async (id: string): Promise<boolean> => {
      const next = customProviders.filter((c) => c.id !== id);
      const nextKeys = { ...textData.apiKeys };
      delete nextKeys[id];
      const nextWrites = { ...textData.writes };
      delete nextWrites[id];
      const nextModel = textData.defaultModel.startsWith(`${id}/`) ? "" : textData.defaultModel;
      const nextTextData: GroupData = {
        ...textData,
        apiKeys: nextKeys,
        writes: nextWrites,
        clears: { ...textData.clears, [id]: true },
        defaultModel: nextModel,
      };
      setCustomProviders(next);
      setTextData(nextTextData);
      const ok = await save(nextTextData, undefined, next);
      if (ok) await refreshTextCatalog();
      return ok;
    },
    [customProviders, textData, save, refreshTextCatalog],
  );

  const makeGroup = (
    kind: "text" | "image",
    providers: Record<string, ProviderConfig>,
    data: GroupData,
    setData: (d: GroupData) => void,
  ): GroupFormState => ({
    providers,
    apiKeys: data.apiKeys,
    configured: data.configured,
    defaultModel: data.defaultModel,
    sampling: data.sampling,
    thinkingLevel: data.thinkingLevel,
    setApiKey: (id, value) => {
      setData({ ...data, apiKeys: { ...data.apiKeys, [id]: value } });
    },
    commitApiKey: (id, value) => {
      if (!value.trim()) return;
      const nextClears = { ...data.clears };
      delete nextClears[id];
      const next: GroupData = {
        ...data,
        apiKeys: { ...data.apiKeys, [id]: value },
        writes: { ...data.writes, [id]: value },
        clears: nextClears,
      };
      setData(next);
      if (kind === "text") void save(next, undefined);
      else void save(undefined, next);
    },
    changeDefaultModel: async (model) => {
      const next = { ...data, defaultModel: model };
      setData(next);
      return kind === "text" ? save(next, undefined) : save(undefined, next);
    },
    patchSampling: async (params) => {
      const next = { ...data, sampling: mergeSampling(data.sampling, params) };
      setData(next);
      return kind === "text" ? save(next, undefined) : save(undefined, next);
    },
    changeThinkingLevel: async (level) => {
      const next = { ...data, thinkingLevel: level };
      setData(next);
      return kind === "text" ? save(next, undefined) : save(undefined, next);
    },
    connect: async (id) => {
      const value = data.apiKeys[id];
      if (!value?.trim()) return false;
      const nextClears = { ...data.clears };
      delete nextClears[id];
      const next: GroupData = {
        ...data,
        writes: { ...data.writes, [id]: value },
        clears: nextClears,
      };
      setData(next);
      return kind === "text" ? save(next, undefined) : save(undefined, next);
    },
    disconnect: async (id) => {
      const nextKeys = { ...data.apiKeys, [id]: "" };
      const nextWrites = { ...data.writes };
      delete nextWrites[id];
      const providerModel = data.defaultModel.startsWith(`${id}/`);
      const nextModel = providerModel ? "" : data.defaultModel;
      const next: GroupData = {
        ...data,
        apiKeys: nextKeys,
        writes: nextWrites,
        clears: { ...data.clears, [id]: true },
        defaultModel: nextModel,
      };
      setData(next);
      return kind === "text" ? save(next, undefined) : save(undefined, next);
    },
  });

  const textGroup = makeGroup("text", textProviders, textData, setTextData);
  return {
    saving,
    text: {
      ...textGroup,
      customProviders,
      addCustomProvider,
      updateCustomProvider,
      removeCustomProvider,
    },
    image: makeGroup("image", imageProviders, imageData, setImageData),
  };
}

function mergeSampling(prev: SamplingParams | undefined, patch: SamplingParams): SamplingParams {
  const merged: SamplingParams = { ...prev, ...patch };
  return merged.temperature === undefined && merged.topP === undefined ? {} : merged;
}
