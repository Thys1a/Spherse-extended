import { FileIcon, Loader2Icon, XIcon } from "lucide-react";
import { useI18n } from "@spherse/i18n/react";
import type { AttachedFile } from "./types";
import { formatFileSize } from "./lib/format-file-size";

interface AttachmentBarProps {
  files: AttachedFile[];
  uploading: boolean;
  onRemove: (path: string) => void;
}

export function AttachmentBar({ files, uploading, onRemove }: AttachmentBarProps) {
  const { t } = useI18n();

  return (
    <div className="mb-2 flex flex-col gap-2 rounded-md border border-border bg-card p-2" data-chat-attachment-bar>
      {uploading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          <span>{t("chat.uploadingAttachment")}</span>
        </div>
      )}
      {files.map((file) => (
        <div key={file.path} className="group/att flex items-center gap-2">
          {file.kind === "image" ? (
            <div className="relative size-16 shrink-0">
              <img
                src={file.previewUrl}
                alt=""
                className="size-16 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(file.path)}
                title={t("chat.removeAttachment")}
                className="absolute end-0.5 top-0.5 rounded-sm bg-background/80 p-0.5 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity hover:text-foreground group-hover/att:opacity-100"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ) : (
            <>
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-xs">{file.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{formatFileSize(file.size)}</span>
              <button
                type="button"
                onClick={() => onRemove(file.path)}
                title={t("chat.removeAttachment")}
                className="rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/att:opacity-100"
              >
                <XIcon className="size-3" />
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
