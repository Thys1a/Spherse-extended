import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { useI18n } from "@spherse/i18n/react";
import { findMatches } from "./hooks/find-engine";
import { replaceAllOccurrences, replaceOneAt } from "./text-replace";

interface EditFindReplaceBarProps {
  text: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onReplace: (nextText: string) => void;
  onClose: () => void;
}

function scrollToOffset(textarea: HTMLTextAreaElement, offset: number): void {
  const line = textarea.value.slice(0, offset).split("\n").length;
  const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || 20;
  textarea.scrollTop = Math.max(0, line * lineHeight - textarea.clientHeight / 2);
}

export function EditFindReplaceBar({ text, textareaRef, onReplace, onClose }: EditFindReplaceBarProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [pendingSelection, setPendingSelection] = useState<{ start: number; end: number } | null>(null);
  const [refocusIndex, setRefocusIndex] = useState<number | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);

  const { matches } = useMemo(() => findMatches(text, query), [text, query]);
  const hasQuery = query.trim().length > 0;
  const hasMatch = matches.length > 0;
  const safeIndex = hasMatch ? Math.min(matchIndex, matches.length - 1) : 0;
  const countLabel = !hasQuery
    ? ""
    : !hasMatch
      ? t("content-browser.find.noMatch")
      : `${safeIndex + 1}/${matches.length}`;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (!pendingSelection) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(pendingSelection.start, pendingSelection.end);
    scrollToOffset(textarea, pendingSelection.start);
    setPendingSelection(null);
  }, [pendingSelection, textareaRef]);

  useEffect(() => {
    if (refocusIndex === null) return;
    setRefocusIndex(null);
    if (matches.length === 0) return;
    const idx = Math.min(refocusIndex, matches.length - 1);
    setMatchIndex(idx);
    setPendingSelection({ start: matches[idx].start, end: matches[idx].end });
  }, [text, refocusIndex, matches]);

  const goTo = (index: number) => {
    if (matches.length === 0) return;
    const idx = (index + matches.length) % matches.length;
    setMatchIndex(idx);
    setPendingSelection({ start: matches[idx].start, end: matches[idx].end });
  };

  const handleReplaceOne = () => {
    const m = matches[safeIndex];
    if (!m) return;
    onReplace(replaceOneAt(text, m.start, m.end, replacement));
    setRefocusIndex(safeIndex);
  };

  const handleReplaceAll = () => {
    if (replacement.length === 0 && !deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setDeleteArmed(false);
    const { nextText, replacedCount } = replaceAllOccurrences(text, query, replacement);
    onReplace(nextText);
    toast.success(t("content-browser.find.replaced", { count: replacedCount }));
  };

  const disarm = () => {
    if (deleteArmed) setDeleteArmed(false);
  };

  return (
    <div
      data-content-edit-findbar
      className="flex items-center gap-2 border-b border-border bg-background px-3 py-2"
    >
      <Input
        ref={inputRef}
        value={query}
        placeholder={t("content-browser.find.placeholder")}
        onChange={(e) => {
          setQuery(e.target.value);
          setMatchIndex(0);
          disarm();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) goTo(safeIndex - 1);
            else goTo(safeIndex + 1);
          }
        }}
        className={hasQuery && !hasMatch ? "text-muted-foreground" : undefined}
        aria-label={t("content-browser.find.placeholder")}
      />
      <Input
        value={replacement}
        placeholder={t("content-browser.find.replacementPlaceholder")}
        onChange={(e) => {
          setReplacement(e.target.value);
          disarm();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "Enter") {
            e.preventDefault();
            handleReplaceOne();
          }
        }}
        aria-label={t("content-browser.find.replacementPlaceholder")}
      />
      <span className="min-w-[3rem] shrink-0 text-end font-mono text-xs text-muted-foreground tabular-nums">
        {countLabel}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => goTo(safeIndex - 1)}
        disabled={!hasMatch}
        title={t("content-browser.find.previous")}
        aria-label={t("content-browser.find.previous")}
      >
        <ChevronUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => goTo(safeIndex + 1)}
        disabled={!hasMatch}
        title={t("content-browser.find.next")}
        aria-label={t("content-browser.find.next")}
      >
        <ChevronDownIcon />
      </Button>
      <Button variant="outline" size="sm" onClick={handleReplaceOne} disabled={!hasMatch}>
        {t("content-browser.find.replace")}
      </Button>
      <Button variant="outline" size="sm" onClick={handleReplaceAll} disabled={!hasMatch}>
        {deleteArmed
          ? t("content-browser.find.confirmDelete", { count: matches.length })
          : t("content-browser.find.replaceAll")}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        title={t("content-browser.find.close")}
        aria-label={t("content-browser.find.close")}
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}
