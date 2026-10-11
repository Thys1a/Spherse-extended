import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { Button } from "../../components/ui/button";
import { ChevronRightIcon, AlertTriangleIcon, RotateCwIcon, SettingsIcon, CopyIcon, CheckIcon } from "lucide-react";
import { useI18n } from "@spherse/i18n/react";
import { ErrorEventCode } from "@spherse/contracts";
import { useAppUiStore } from "../../stores/app-ui-store";
import type { EntryDiagnostics } from "./model/entry";

interface ErrorMessageSectionProps {
  error: string;
  errorCode?: ErrorEventCode;
  diagnostics?: EntryDiagnostics;
  onRetry?: () => void;
}

function diagnosticRows(diagnostics: EntryDiagnostics): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const push = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    rows.push([key, String(value)]);
  };
  push("provider", diagnostics.provider);
  push("model", diagnostics.model);
  push("stopReason", diagnostics.stopReason);
  push("rawStopReason", diagnostics.rawStopReason);
  push("errorMessage", diagnostics.errorMessage);
  push("prompt", diagnostics.promptTokens);
  push("output", diagnostics.outputTokens);
  push("reasoning", diagnostics.reasoningTokens);
  push("promptEstimate", diagnostics.promptEstimate);
  push("seq", diagnostics.seq);
  return rows;
}

export function ErrorMessageSection({ error, errorCode, diagnostics, onRetry }: ErrorMessageSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();
  const openSettings = useAppUiStore((s) => s.openSettings);

  const detail = errorCode === ErrorEventCode.ModelNotConfigured
    ? t("chat.error.modelNotConfigured")
    : errorCode === ErrorEventCode.Auth
      ? t("chat.error.authFailed")
      : error;
  const isAuth = errorCode === ErrorEventCode.Auth;
  const rows = diagnostics ? diagnosticRows(diagnostics) : [];

  const copyDiagnostics = () => {
    if (rows.length === 0) return;
    navigator.clipboard
      .writeText(rows.map(([key, value]) => `${key}: ${value}`).join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="mt-2 border-t border-dashed border-border pt-2" data-chat-error>
      <Collapsible open={expanded}>
        <CollapsibleTrigger
          render={<Button variant="ghost" className="-mx-1 h-auto w-full justify-start gap-1 px-1 py-1 pe-3 text-xs text-destructive hover:text-destructive" />}
          onClick={() => setExpanded((v) => !v)}
        >
          <span
            className="inline-flex size-3 items-center justify-center transition-transform"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            <ChevronRightIcon className="size-3" />
          </span>
          <AlertTriangleIcon className="size-3" />
          {t("chat.responseGenerationFailed")}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-4 mt-0.5 mb-1.5 text-xs text-destructive break-all">
            {detail}
          </div>
          {rows.length > 0 && (
            <div className="ml-4 mb-1.5" data-chat-error-detail>
              <div className="mb-1 flex items-center gap-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("chat.error.detail.title")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={copyDiagnostics}
                >
                  {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
                  {t("chat.error.detail.copy")}
                </Button>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-xs break-all">
                {rows.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
      {isAuth && (
        <Button
          variant="ghost"
          size="sm"
          className="ms-1 mb-1 h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => openSettings("models")}
          data-chat-open-settings
        >
          <SettingsIcon className="size-3" />
          {t("chat.error.openSettings")}
        </Button>
      )}
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          className="ms-1 mb-1 h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onRetry}
          data-chat-retry
        >
          <RotateCwIcon className="size-3" />
          {t("chat.retry")}
        </Button>
      )}
    </div>
  );
}
