import type { RefObject } from "react";
import { useI18n } from "@spherse/i18n/react";
import { cn } from "@/lib/utils";
import type { TocEntry } from "./useContentToc";

export function TocPanel({
  entries,
  containerRef,
}: {
  entries: TocEntry[];
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useI18n();

  const handleSelect = (id: string) => {
    const target = containerRef.current?.querySelector(`#${CSS.escape(id)}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <aside
      aria-label={t("content-browser.toc.title")}
      className="w-56 shrink-0 overflow-y-auto border-l border-border px-3 py-4"
    >
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t("content-browser.toc.title")}
      </p>
      <ul className="flex flex-col gap-px">
        {entries.map((entry, idx) => (
          <li key={`${entry.id}#${idx}`}>
            <button
              type="button"
              onClick={() => handleSelect(entry.id)}
              title={entry.text}
              style={{ paddingLeft: (entry.level - 1) * 12 }}
              className={cn(
                "block w-full truncate rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                entry.level === 1 && "font-medium text-foreground",
              )}
            >
              {entry.text}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
