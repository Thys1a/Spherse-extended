import type { QuickReply } from "@spherse/core";
import { useI18n } from "@spherse/i18n/react";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { HintLabel } from "./HintLabel";

export function QuickReplyField({
  replies,
  onManage,
  label,
  hint,
}: {
  replies: QuickReply[];
  onManage: () => void;
  label: string;
  hint: string;
}) {
  const { t } = useI18n();
  return (
    <Field>
      <HintLabel hint={hint}>{label}</HintLabel>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t("agent-dialog.quickRepliesCount", { count: replies.length })}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onManage}>
          {t("agent-dialog.quickRepliesManage")}
        </Button>
      </div>
    </Field>
  );
}
