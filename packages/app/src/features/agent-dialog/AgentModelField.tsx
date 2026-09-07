import { useState } from "react";
import type { ProviderCatalogItem } from "@spherse/core";
import {
  Combobox,
  ComboboxContent,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxIcon,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "../../components/ui/combobox";
import { Field } from "../../components/ui/field";
import { useI18n } from "@spherse/i18n/react";
import { HintLabel } from "./HintLabel";
import { cn } from "@/lib/utils";

export function AgentModelField({
  providers,
  apiKeys,
  globalDefault,
  value,
  onChange,
}: {
  providers: Record<string, ProviderCatalogItem>;
  apiKeys: Record<string, string>;
  globalDefault: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  const configuredProviders = Object.entries(providers).filter(([id]) => apiKeys[id]?.trim());

  const selectedLabel = (() => {
    if (!value) return t("agent-dialog.modelFollowGlobal", { model: globalDefault });
    const slashIdx = value.indexOf("/");
    if (slashIdx < 0) return value;
    const providerId = value.slice(0, slashIdx);
    const modelId = value.slice(slashIdx + 1);
    const config = providers[providerId];
    const model = config?.models.find((m) => m.id === modelId);
    return model?.name ?? value;
  })();

  const lowerQuery = query.trim().toLowerCase();
  const filtered = configuredProviders
    .map(([id, config]) => {
      const providerMatch = config.name.toLowerCase().includes(lowerQuery);
      const models = providerMatch
        ? config.models
        : config.models.filter((m) => m.name.toLowerCase().includes(lowerQuery));
      return { id, config, models };
    })
    .filter((g) => g.models.length > 0);

  return (
    <Field>
      <HintLabel hint={t("agent-dialog.modelHint")}>{t("agent-dialog.modelLabel")}</HintLabel>
      {configuredProviders.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("agent-dialog.modelConfigureFirst")}</p>
      ) : (
        <Combobox
          value={value || null}
          onValueChange={(v) => onChange((v as string) ?? "")}
          filter={null}
          defaultInputValue=""
          onInputValueChange={(input) => setQuery(input)}
          onOpenChange={(open) => { if (open) setQuery(""); }}
        >
          <ComboboxTrigger>
            <span className={cn("flex-1 truncate text-start", !value && "text-muted-foreground")}>
              {selectedLabel}
            </span>
            <ComboboxIcon />
          </ComboboxTrigger>
          <ComboboxContent>
            <ComboboxInput placeholder={t("agent-dialog.modelSearchPlaceholder")} />
            <ComboboxList>
              <ComboboxItem value="">{t("agent-dialog.modelFollowGlobal", { model: globalDefault })}</ComboboxItem>
              {filtered.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  {t("agent-dialog.modelNoResults")}
                </p>
              ) : (
                filtered.map(({ id, config, models }) => (
                  <ComboboxGroup key={id}>
                    <ComboboxGroupLabel>{config.name}</ComboboxGroupLabel>
                    {models.map((m) => (
                      <ComboboxItem key={`${id}/${m.id}`} value={`${id}/${m.id}`}>
                        {m.name}
                      </ComboboxItem>
                    ))}
                  </ComboboxGroup>
                ))
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      )}
    </Field>
  );
}
