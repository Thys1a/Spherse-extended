import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@spherse/i18n/react";
import { useDismissable } from "../../hooks/useDismissable";

interface SelectionMenuProps {
  x: number;
  y: number;
  canQuote?: boolean;
  onCopy: () => void;
  onQuote: () => void;
  onClose: () => void;
}

const MENU_MARGIN = 8;
const MENU_ESTIMATED_WIDTH = 160;
const MENU_ESTIMATED_HEIGHT = 96;

export function SelectionMenu({ x, y, canQuote = true, onCopy, onQuote, onClose }: SelectionMenuProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useDismissable({ ref, onDismiss: onClose });

  useEffect(() => {
    window.addEventListener("scroll", onClose, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", onClose, { capture: true });
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-32 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
      style={{
        left: Math.max(MENU_MARGIN, Math.min(x, window.innerWidth - MENU_ESTIMATED_WIDTH)),
        top: Math.max(MENU_MARGIN, Math.min(y, window.innerHeight - MENU_ESTIMATED_HEIGHT)),
      }}
    >
      <button
        type="button"
        role="menuitem"
        className="flex min-h-7 w-full cursor-default items-center gap-2 rounded-md px-2 py-1 text-xs/relaxed outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
        onClick={onCopy}
      >
        {t("chat.selectionMenu.copy")}
      </button>
      {canQuote && (
        <button
          type="button"
          role="menuitem"
          className="flex min-h-7 w-full cursor-default items-center gap-2 rounded-md px-2 py-1 text-xs/relaxed outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          onClick={onQuote}
        >
          {t("chat.selectionMenu.quote")}
        </button>
      )}
    </div>,
    document.body,
  );
}
