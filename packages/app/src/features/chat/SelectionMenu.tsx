import { useRef } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@spherse/i18n/react";
import { useDismissable } from "../../hooks/useDismissable";

interface SelectionMenuProps {
  x: number;
  y: number;
  onCopy: () => void;
  onQuote: () => void;
  onClose: () => void;
}

export function SelectionMenu({ x, y, onCopy, onQuote, onClose }: SelectionMenuProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useDismissable({ ref, onDismiss: onClose });

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-32 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
      style={{
        left: Math.max(8, Math.min(x, window.innerWidth - 160)),
        top: Math.max(8, Math.min(y, window.innerHeight - 96)),
      }}
    >
      <button
        type="button"
        role="menuitem"
        className="flex min-h-7 w-full cursor-default items-center gap-2 rounded-md px-2 py-1 text-xs/relaxed outline-hidden select-none focus:bg-accent focus:text-accent-foreground"
        onClick={onCopy}
      >
        {t("chat.selectionMenu.copy")}
      </button>
      <button
        type="button"
        role="menuitem"
        className="flex min-h-7 w-full cursor-default items-center gap-2 rounded-md px-2 py-1 text-xs/relaxed outline-hidden select-none focus:bg-accent focus:text-accent-foreground"
        onClick={onQuote}
      >
        {t("chat.selectionMenu.quote")}
      </button>
    </div>,
    document.body,
  );
}
