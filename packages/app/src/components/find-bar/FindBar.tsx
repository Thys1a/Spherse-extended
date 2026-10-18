import { type RefObject, useEffect, useRef } from "react";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useI18n } from "@spherse/i18n/react";
import { useContentFind } from "./useContentFind";

interface FindBarProps {
  containerRef: RefObject<HTMLDivElement | null>;
  contentKey: string;
  onClose: () => void;
  labelPrefix?: "content-browser.find" | "chat.find";
}

type FindLabelSuffix = "placeholder" | "noMatch" | "previous" | "next" | "close";

export function FindBar({ containerRef, contentKey, onClose, labelPrefix = "content-browser.find" }: FindBarProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const find = useContentFind({ containerRef, contentKey });
  const label = (suffix: FindLabelSuffix) => t(`${labelPrefix}.${suffix}`);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const hasQuery = find.query.trim().length > 0;
  const hasMatch = find.matchCount > 0;
  const countLabel = !hasQuery
    ? ""
    : !hasMatch
      ? label("noMatch")
      : find.overLimit
        ? `${find.matchIndex + 1}/${find.matchCount}+`
        : `${find.matchIndex + 1}/${find.matchCount}`;

  return (
    <div
      data-find-bar
      className="flex items-center gap-2 border-b border-border bg-background px-3 py-2"
    >
      <Input
        ref={inputRef}
        value={find.query}
        placeholder={label("placeholder")}
        onChange={(e) => find.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) find.prev();
            else find.next();
          }
        }}
        className={hasQuery && !hasMatch ? "text-muted-foreground" : undefined}
        aria-label={label("placeholder")}
      />
      <span className="min-w-[3rem] shrink-0 text-end font-mono text-xs text-muted-foreground tabular-nums">
        {countLabel}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={find.prev}
        disabled={!hasMatch}
        title={label("previous")}
        aria-label={label("previous")}
      >
        <ChevronUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={find.next}
        disabled={!hasMatch}
        title={label("next")}
        aria-label={label("next")}
      >
        <ChevronDownIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        title={label("close")}
        aria-label={label("close")}
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}
