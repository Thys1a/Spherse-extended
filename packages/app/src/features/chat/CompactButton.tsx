import { useI18n } from "@spherse/i18n/react";
import { Loader2Icon, ShrinkIcon } from "lucide-react";
import { Button } from "../../components/ui/button";

interface CompactButtonProps {
  compacting: boolean;
  disabled: boolean;
  onCompact: () => void;
  className?: string;
}

export function CompactButton({ compacting, disabled, onCompact, className }: CompactButtonProps) {
  const { t } = useI18n();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className ?? "text-muted-foreground"}
      onClick={onCompact}
      disabled={disabled || compacting}
      title={t("chat.compactTooltip")}
      data-chat-compact
    >
      {compacting ? <Loader2Icon className="animate-spin" /> : <ShrinkIcon />}
    </Button>
  );
}
