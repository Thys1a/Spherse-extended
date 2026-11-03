import type { CSSProperties } from "react";
import { Maximize2, Minimize2, XIcon } from "lucide-react";
import { useI18n } from "@spherse/i18n/react";

interface FloatTitleBarProps {
  title: string;
  onDock: () => void;
  onExpand?: () => void;
  onClose: () => void;
}

const DRAG_REGION = { WebkitAppRegion: "drag" } as CSSProperties;
const NO_DRAG_REGION = { WebkitAppRegion: "no-drag" } as CSSProperties;

export function FloatTitleBar({ title, onDock, onExpand, onClose }: FloatTitleBarProps) {
  const { t } = useI18n();
  return (
    <div
      data-float-titlebar
      className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 select-none"
      style={DRAG_REGION}
    >
      <span className="truncate text-xs font-medium">{title}</span>
      <div className="ml-auto flex items-center gap-0.5" style={NO_DRAG_REGION}>
        <button
          type="button"
          data-float-dock
          onClick={onDock}
          title={t("float-window.dock")}
          aria-label={t("float-window.dock")}
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted-foreground/10"
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
        {onExpand && (
          <button
            type="button"
            data-float-expand
            onClick={onExpand}
            title={t("float-window.expand")}
            aria-label={t("float-window.expand")}
            className="inline-flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted-foreground/10"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          data-float-close
          onClick={onClose}
          title={t("common.close")}
          aria-label={t("common.close")}
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted-foreground/10"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
