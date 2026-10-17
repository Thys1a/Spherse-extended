import type { ProviderCatalogItem } from "@spherse/core";
import type { ModelSettingsRequest, ModelSettingsResponse } from "../../lib/types";
import type { HostSettings } from "../../lib/host-bridge";

export type ProviderConfig = ProviderCatalogItem;
export type AppSettings = HostSettings;

export interface SettingsApi {
  getSettings: () => Promise<AppSettings | null>;
  saveSettings: (settings: AppSettings) => Promise<{ success: boolean }>;
  getSupportedProviders: () => Promise<Record<string, ProviderConfig>>;
  getImageProviders: () => Promise<Record<string, ProviderConfig>>;
}

export interface ModelSettingsApi {
  getModelSettings: () => Promise<ModelSettingsResponse>;
  updateModelSettings: (req: ModelSettingsRequest) => Promise<ModelSettingsResponse>;
  getSupportedProviders: () => Promise<Record<string, ProviderConfig>>;
  getImageProviders: () => Promise<Record<string, ProviderConfig>>;
}
