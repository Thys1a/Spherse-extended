import { useEffect, useState } from "react";
import { useI18n } from "@spherse/i18n/react";
import type { CustomProviderDef } from "@spherse/core";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { Textarea } from "../../components/ui/textarea";
import { Plus, X } from "lucide-react";
import { customProviderDefaults } from "./custom-provider-defaults";
import {
  headersToRecord,
  isValidHeaderName,
  isValidHeaderValue,
  MAX_HEADER_COUNT,
  recordToHeaderRows,
  type HeaderRow,
} from "./custom-provider-headers";

interface CustomProviderDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (def: CustomProviderDef) => void;
  initial?: CustomProviderDef;
}

function parseModelIds(text: string): string[] {
  const parts = text
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return [...new Set(parts)];
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parsePositiveInt(value: string): number | undefined {
  if (value.trim().length === 0) return undefined;
  if (!/^\d+$/.test(value.trim())) return NaN;
  const parsed = Number(value.trim());
  return parsed > 0 ? parsed : NaN;
}

export function CustomProviderDialog({
  open,
  onClose,
  onSubmit,
  initial,
}: CustomProviderDialogProps) {
  const { t } = useI18n();

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelsText, setModelsText] = useState("");
  const [keyless, setKeyless] = useState(false);
  const [contextWindowText, setContextWindowText] = useState("");
  const [maxTokensText, setMaxTokensText] = useState("");
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setBaseUrl(initial?.baseUrl ?? "");
    setModelsText(initial?.models?.join("\n") ?? "");
    setKeyless(initial?.keyless ?? false);
    setContextWindowText(initial?.contextWindow != null ? String(initial.contextWindow) : "");
    setMaxTokensText(initial?.maxTokens != null ? String(initial.maxTokens) : "");
    setHeaderRows(recordToHeaderRows(initial?.headers));
  }, [open, initial]);

  const parsedModels = parseModelIds(modelsText);
  const trimmedName = name.trim();
  const trimmedBaseUrl = baseUrl.trim();
  const contextWindow = parsePositiveInt(contextWindowText);
  const maxTokens = parsePositiveInt(maxTokensText);

  const nameError =
    trimmedName.length === 0
      ? t("settings.provider.dialog.errNameRequired")
      : "";
  const baseUrlError =
    trimmedBaseUrl.length === 0
      ? t("settings.provider.dialog.errBaseUrlRequired")
      : isHttpUrl(trimmedBaseUrl)
        ? ""
        : t("settings.provider.dialog.errBaseUrlInvalid");
  const modelsError =
    parsedModels.length === 0
      ? t("settings.provider.dialog.errModelsRequired")
      : "";
  const contextWindowError =
    contextWindowText.trim().length === 0 || !Number.isNaN(contextWindow)
      ? ""
      : t("settings.provider.dialog.errLimitInvalid");
  const maxTokensError =
    maxTokensText.trim().length === 0 || !Number.isNaN(maxTokens)
      ? ""
      : t("settings.provider.dialog.errLimitInvalid");

  const headerErrors = headerRows.map((row) => {
    if (row.name.trim() === "") return "";
    if (!isValidHeaderName(row.name)) return t("settings.provider.dialog.errHeaderName");
    if (!isValidHeaderValue(row.value)) return t("settings.provider.dialog.errHeaderValue");
    return "";
  });
  const headersCountError =
    headerRows.filter((row) => row.name.trim() !== "").length > MAX_HEADER_COUNT
      ? t("settings.provider.dialog.errHeadersTooMany")
      : "";

  const hasErrors = Boolean(
    nameError || baseUrlError || modelsError || contextWindowError || maxTokensError || headersCountError || headerErrors.some(Boolean),
  );

  const updateHeaderRow = (index: number, patch: Partial<HeaderRow>) => {
    setHeaderRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeHeaderRow = (index: number) => {
    setHeaderRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addHeaderRow = () => {
    setHeaderRows((prev) => [...prev, { name: "", value: "" }]);
  };

  const handleSubmit = () => {
    if (hasErrors) return;
    const headers = headersToRecord(headerRows);
    onSubmit({
      id: initial?.id ?? "",
      name: trimmedName,
      baseUrl: trimmedBaseUrl,
      models: parsedModels,
      keyless,
      ...(contextWindow !== undefined && !Number.isNaN(contextWindow)
        ? { contextWindow }
        : {}),
      ...(maxTokens !== undefined && !Number.isNaN(maxTokens) ? { maxTokens } : {}),
      ...(headers ? { headers } : {}),
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(openValue) => {
        if (!openValue) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {initial
              ? t("settings.provider.dialog.titleEdit")
              : t("settings.provider.dialog.titleAdd")}
          </DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="custom-provider-name">
              {t("settings.provider.dialog.name")}
            </FieldLabel>
            <Input
              id="custom-provider-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("settings.provider.dialog.namePlaceholder")}
              aria-invalid={Boolean(nameError)}
            />
            {nameError ? <FieldError>{nameError}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="custom-provider-base-url">
              {t("settings.provider.dialog.baseUrl")}
            </FieldLabel>
            <Input
              id="custom-provider-base-url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={t("settings.provider.dialog.baseUrlPlaceholder")}
              aria-invalid={Boolean(baseUrlError)}
            />
            {baseUrlError ? <FieldError>{baseUrlError}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="custom-provider-models">
              {t("settings.provider.dialog.models")}
            </FieldLabel>
            <Textarea
              id="custom-provider-models"
              value={modelsText}
              onChange={(event) => setModelsText(event.target.value)}
              placeholder={t("settings.provider.dialog.modelsPlaceholder")}
              aria-invalid={Boolean(modelsError)}
            />
            <FieldDescription>
              {t("settings.provider.dialog.modelsHint")}
            </FieldDescription>
            {modelsError ? <FieldError>{modelsError}</FieldError> : null}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="custom-provider-context-window">
                {t("settings.provider.dialog.contextWindow")}
              </FieldLabel>
              <Input
                id="custom-provider-context-window"
                type="number"
                inputMode="numeric"
                min={1}
                value={contextWindowText}
                onChange={(event) => setContextWindowText(event.target.value)}
                placeholder={t("settings.provider.dialog.contextWindowPlaceholder", {
                  value: customProviderDefaults.contextWindow,
                })}
                aria-invalid={Boolean(contextWindowError)}
              />
              {contextWindowError ? <FieldError>{contextWindowError}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="custom-provider-max-tokens">
                {t("settings.provider.dialog.maxTokens")}
              </FieldLabel>
              <Input
                id="custom-provider-max-tokens"
                type="number"
                inputMode="numeric"
                min={1}
                value={maxTokensText}
                onChange={(event) => setMaxTokensText(event.target.value)}
                placeholder={t("settings.provider.dialog.maxTokensPlaceholder", {
                  value: customProviderDefaults.maxTokens,
                })}
                aria-invalid={Boolean(maxTokensError)}
              />
              {maxTokensError ? <FieldError>{maxTokensError}</FieldError> : null}
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("settings.provider.dialog.limitsHint")}
          </p>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium leading-none">
                {t("settings.provider.dialog.keyless")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("settings.provider.dialog.keylessDesc")}
              </span>
            </div>
            <Switch checked={keyless} onCheckedChange={setKeyless} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-none">
                  {t("settings.provider.dialog.headers")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("settings.provider.dialog.headersHint")}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addHeaderRow}
                disabled={headerRows.length >= MAX_HEADER_COUNT}
              >
                <Plus />
                {t("settings.provider.dialog.addHeader")}
              </Button>
            </div>
            {headersCountError ? (
              <p className="text-xs text-destructive">{headersCountError}</p>
            ) : null}
            {headerRows.map((row, index) => (
              <div key={index} className="space-y-1">
                <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                  <Input
                    value={row.name}
                    onChange={(event) => updateHeaderRow(index, { name: event.target.value })}
                    placeholder={t("settings.provider.dialog.headerNamePlaceholder")}
                    aria-invalid={Boolean(headerErrors[index])}
                  />
                  <Input
                    value={row.value}
                    onChange={(event) => updateHeaderRow(index, { value: event.target.value })}
                    placeholder={t("settings.provider.dialog.headerValuePlaceholder")}
                    aria-invalid={Boolean(headerErrors[index])}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeHeaderRow(index)}
                    aria-label={t("settings.provider.dialog.removeHeader")}
                  >
                    <X />
                  </Button>
                </div>
                {headerErrors[index] ? (
                  <p className="text-xs text-destructive">{headerErrors[index]}</p>
                ) : null}
              </div>
            ))}
          </div>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("settings.provider.dialog.cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={hasErrors}>
            {t("settings.provider.dialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
