import { useI18n } from "@spherse/i18n/react";
import type { WebSearchSettings } from "@spherse/core";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { SectionTitle } from "./SectionTitle";

export function WebSearchPanel({
  webSearch,
  onChange,
}: {
  webSearch: WebSearchSettings;
  onChange: (patch: Partial<WebSearchSettings>) => void;
}) {
  const { t } = useI18n();

  return (
    <FieldGroup className="mt-5">
      <SectionTitle>{t("settings.webSearch.title")}</SectionTitle>
      <span className="text-xs text-muted-foreground">{t("settings.webSearch.desc")}</span>
      <Field>
        <FieldLabel>{t("settings.webSearch.apiKey")}</FieldLabel>
        <span className="text-xs text-muted-foreground">{t("settings.webSearch.apiKeyDesc")}</span>
        <Input
          className="w-full"
          type="password"
          placeholder={t("settings.webSearch.apiKeyPlaceholder")}
          value={webSearch.apiKey ?? ""}
          onChange={(e) => onChange({ apiKey: e.target.value.trim() || undefined })}
        />
      </Field>
      <Field>
        <FieldLabel>{t("settings.webSearch.baseUrl")}</FieldLabel>
        <span className="text-xs text-muted-foreground">{t("settings.webSearch.baseUrlDesc")}</span>
        <Input
          className="w-full"
          placeholder={t("settings.webSearch.baseUrlPlaceholder")}
          value={webSearch.baseUrl ?? ""}
          onChange={(e) => onChange({ baseUrl: e.target.value.trim() || undefined })}
        />
      </Field>
      <Field>
        <FieldLabel>{t("settings.webSearch.model")}</FieldLabel>
        <span className="text-xs text-muted-foreground">{t("settings.webSearch.modelDesc")}</span>
        <Input
          className="w-full"
          placeholder={t("settings.webSearch.modelPlaceholder")}
          value={webSearch.model ?? ""}
          onChange={(e) => onChange({ model: e.target.value.trim() || undefined })}
        />
      </Field>
    </FieldGroup>
  );
}
