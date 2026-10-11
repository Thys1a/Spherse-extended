import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@spherse/i18n/react";
import { useChatAgent } from "../chat-agent-context";
import { useComposerInsertStore } from "../composer-insert-store";
import { quoteFenceFor } from "../lib/quote-fence";

export function useSelectionMenu() {
  const { t } = useI18n();
  const agent = useChatAgent();
  const sessionId = agent?.sessionId ?? null;
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    const selection = window.getSelection();
    const text = selection?.toString() ?? "";
    if (
      !text.trim() ||
      !bubbleRef.current ||
      !selection?.anchorNode ||
      !selection.focusNode ||
      !bubbleRef.current.contains(selection.anchorNode) ||
      !bubbleRef.current.contains(selection.focusNode)
    ) {
      setMenu(null);
      return;
    }
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, text });
  }, []);

  const handleCopySelection = useCallback(() => {
    const text = menu?.text;
    setMenu(null);
    if (!text) return;
    if (!navigator.clipboard) {
      toast.error(t("chat.selectionMenu.copyFailed"));
      return;
    }
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .catch(() => {
        toast.error(t("chat.selectionMenu.copyFailed"));
      });
  }, [menu, t]);

  const handleQuoteSelection = useCallback(() => {
    if (menu && sessionId) {
      const fence = quoteFenceFor(menu.text);
      useComposerInsertStore
        .getState()
        .requestInsert(sessionId, `${fence}quoted\n${menu.text}\n${fence}`);
    }
    setMenu(null);
  }, [menu, sessionId]);

  const handleCloseMenu = useCallback(() => setMenu(null), []);

  return {
    bubbleRef,
    menu,
    sessionId,
    handleContextMenu,
    handleCopySelection,
    handleQuoteSelection,
    handleCloseMenu,
  };
}
