import type { ProviderCatalogItem } from "@spherse/core";

export function resolveModelContextWindow(
  modelId: string | undefined,
  providers: Record<string, ProviderCatalogItem>,
): number | undefined {
  if (!modelId) return undefined;
  const slashIdx = modelId.indexOf("/");
  if (slashIdx < 0) {
    for (const config of Object.values(providers)) {
      const found = config.models.find((m) => m.id === modelId);
      if (found?.contextWindow) return found.contextWindow;
    }
    return undefined;
  }
  const providerId = modelId.slice(0, slashIdx);
  const modelPart = modelId.slice(slashIdx + 1);
  return providers[providerId]?.models.find((m) => m.id === modelPart)?.contextWindow;
}
