import { useState } from "react";
import { createPortal } from "react-dom";
import { DownloadIcon, FileIcon, XIcon } from "lucide-react";
import { useI18n } from "@spherse/i18n/react";
import type { ChatAttachment } from "./types";
import { useProjectCtx } from "../../context/project-context";
import { useApiClient } from "../../lib/use-connection";
import { formatFileSize } from "./lib/format-file-size";

const TEXT_INLINE_BUDGET_BYTES = 16 * 1024;

interface MessageAttachmentsProps {
  attachments: ChatAttachment[];
}

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  const { t } = useI18n();
  const { projectId } = useProjectCtx();
  const client = useApiClient(projectId);
  const [openPath, setOpenPath] = useState<string | null>(null);

  if (!client) return null;
  const images = attachments.filter((a) => a.type === "image");
  const files = attachments.filter((a) => a.type !== "image");
  if (images.length === 0 && files.length === 0) return null;

  return (
    <>
      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((att) => (
            <button
              type="button"
              key={att.path}
              onClick={() => setOpenPath(att.path)}
              className="block overflow-hidden rounded-md border border-border"
            >
              <img
                src={client.getPreviewUrl(att.path)}
                alt=""
                className="max-h-48 max-w-full cursor-zoom-in object-cover"
              />
            </button>
          ))}
        </div>
      )}
      {files.map((att) => {
        const truncated = (att.bytes ?? 0) > TEXT_INLINE_BUDGET_BYTES;
        return (
          <div key={att.path} className="mt-2 flex items-center gap-2 rounded-md border border-border px-2.5 py-2">
            <FileIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{att.name ?? att.path}</div>
              {att.bytes !== undefined && (
                <div className="text-[11px] text-muted-foreground">{formatFileSize(att.bytes)}</div>
              )}
              {truncated && (
                <div className="text-[11px] text-muted-foreground">
                  {t("chat.attachmentTruncated", { shown: formatFileSize(TEXT_INLINE_BUDGET_BYTES) })}
                </div>
              )}
            </div>
            <a
              href={client.getAttachmentDownloadUrl(att.path)}
              download
              title={t("chat.attachmentDownload")}
              className="shrink-0 rounded-sm p-1 text-muted-foreground hover:text-foreground"
            >
              <DownloadIcon className="size-3.5" />
            </a>
          </div>
        );
      })}
      {openPath &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setOpenPath(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm"
          >
            <img
              src={client.getPreviewUrl(openPath)}
              alt=""
              className="max-h-full max-w-full rounded-md object-contain"
            />
            <button
              type="button"
              onClick={() => setOpenPath(null)}
              aria-label="close"
              className="absolute end-4 top-4 rounded-full bg-background/80 p-2 text-foreground"
            >
              <XIcon />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
