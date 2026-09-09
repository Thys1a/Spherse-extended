import { useI18n } from "@spherse/i18n/react";
import type { ProxySettings } from "@spherse/core";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { SectionTitle } from "./SectionTitle";

export function ProxyPanel({
  proxy,
  onChange,
}: {
  proxy: ProxySettings;
  onChange: (patch: Partial<ProxySettings>) => void;
}) {
  const { t } = useI18n();

  return (
    <FieldGroup className="mt-5">
      <SectionTitle>{t("settings.proxy.title")}</SectionTitle>
      <Field>
        <FieldLabel>{t("settings.proxy.url")}</FieldLabel>
        <span className="text-xs text-muted-foreground">{t("settings.proxy.urlDesc")}</span>
        <Input
          className="w-full"
          placeholder={t("settings.proxy.urlPlaceholder")}
          value={proxy.url ?? ""}
          onChange={(e) => onChange({ url: e.target.value || undefined })}
        />
      </Field>
      <Field>
        <FieldLabel>{t("settings.proxy.noProxy")}</FieldLabel>
        <span className="text-xs text-muted-foreground">{t("settings.proxy.noProxyDesc")}</span>
        <Input
          className="w-full"
          placeholder={t("settings.proxy.noProxyPlaceholder")}
          value={proxy.noProxy ?? ""}
          onChange={(e) => onChange({ noProxy: e.target.value || undefined })}
        />
      </Field>
    </FieldGroup>
  );
}
