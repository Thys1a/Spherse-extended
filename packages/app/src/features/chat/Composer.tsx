import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@spherse/i18n/react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { ChevronsDownIcon, ChevronsUpIcon, Loader2Icon, PaperclipIcon, SendIcon, SquareIcon } from "lucide-react";
import type { AttachedFile } from "./types";
import { compressImage } from "./utils/compress-image";
import { AttachmentBar } from "./AttachmentBar";
import { useProjectCtx } from "../../context/project-context";
import { useApiClient } from "../../lib/use-connection";
import { useIsCoarsePointer } from "../../hooks/use-coarse-pointer";
import { useComposerInsertStore } from "./composer-insert-store";
import { SessionModelPill } from "./SessionModelPill";
import { useProjectAgents } from "../../queries/project";
import { useProjectCommands } from "../../queries/commands";
import { useProjectSkills } from "../../queries/skills";
import {
  applySlashPick,
  filterSlashItems,
  matchSlashToken,
  type SlashMenuItem,
} from "./lib/slash-menu";

const LINE_HEIGHT = 20;
const PADDING_Y = 16;
const MIN_HEIGHT = 2 * LINE_HEIGHT + PADDING_Y;
const MID_HEIGHT = 10 * LINE_HEIGHT + PADDING_Y;
const MAX_HEIGHT = 20 * LINE_HEIGHT + PADDING_Y;

interface ComposerProps {
  streaming: boolean;
  loading?: boolean;
  sessionId: string;
  onSend: (message: string, attachments?: AttachedFile[]) => boolean;
  onAbort: () => void;
}

export function Composer({ streaming, loading = false, sessionId, onSend, onAbort }: ComposerProps) {
  const { t } = useI18n();
  const { projectId } = useProjectCtx();
  const client = useApiClient(projectId);
  const isTouchKeyboard = useIsCoarsePointer();
  const draftKey = `spherse:draft:${sessionId}`;
  const [input, setInput] = useState(() => localStorage.getItem(draftKey) ?? "");
  const [manualExpanded, setManualExpanded] = useState(false);
  const [contentExceeds3Lines, setContentExceeds3Lines] = useState(false);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  });

  const insertNonce = useComposerInsertStore((s) => s.nonce);

  useEffect(() => {
    if (insertNonce === 0) return;
    const { sessionId: targetSessionId, text } = useComposerInsertStore.getState();
    if (targetSessionId !== sessionId || !text) return;
    const textarea = textareaRef.current;
    const value = inputRef.current;
    if (!textarea) {
      setInput(`${value}${text}`);
    } else {
      const start = textarea.selectionStart ?? value.length;
      const end = textarea.selectionEnd ?? value.length;
      const prefix = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
      const suffix = end < value.length && value[end] !== "\n" ? "\n" : "";
      const inserted = `${prefix}${text}${suffix}`;
      setInput(`${value.slice(0, start)}${inserted}${value.slice(end)}`);
      const cursor = start + inserted.length;
      const focus = () => {
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(focus);
      } else {
        focus();
      }
    }
    useComposerInsertStore.getState().consume(insertNonce);
  }, [insertNonce, sessionId]);

  const attachBusy = uploadingCount > 0;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const prevScrollTop = textarea.scrollTop;
    textarea.style.height = "auto"; // collapse to measure scrollHeight
    const natural = textarea.scrollHeight;
    const exceeds = natural > MIN_HEIGHT + 4;
    setContentExceeds3Lines(exceeds);
    if (!exceeds && manualExpanded) {
      setManualExpanded(false);
      return;
    }
    if (manualExpanded) {
      textarea.style.height = `${MAX_HEIGHT}px`;
      textarea.style.overflowY = natural > MAX_HEIGHT ? "auto" : "hidden";
    } else {
      const targetHeight = Math.max(MIN_HEIGHT, Math.min(natural, MID_HEIGHT));
      textarea.style.height = `${targetHeight}px`;
      textarea.style.overflowY = natural > MID_HEIGHT ? "auto" : "hidden";
    }
    textarea.scrollTop = prevScrollTop; // prevent scroll-to-top after height change
  }, [input, manualExpanded]);

  useEffect(() => {
    if (input) {
      const timer = setTimeout(() => localStorage.setItem(draftKey, input), 300);
      return () => clearTimeout(timer);
    }
    localStorage.removeItem(draftKey);
  }, [input, draftKey]);

  useEffect(() => {
    return () => {
      if (inputRef.current) {
        localStorage.setItem(`spherse:draft:${sessionId}`, inputRef.current);
      }
    };
  }, [sessionId]);

  const { data: skills = [] } = useProjectSkills(projectId, client);
  const { data: commands = [] } = useProjectCommands(projectId, client);
  const { agents } = useProjectAgents(projectId, client);
  const [menuSelected, setMenuSelected] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [cursorPos, setCursorPos] = useState<number | null>(null);

  const syncCursor = (target: HTMLTextAreaElement | null) => {
    if (!target) return;
    setCursorPos(target.selectionStart ?? target.value.length);
  };

  const cursor = cursorPos ?? input.length;
  const slashMatch = matchSlashToken(input.slice(0, cursor));
  const menuItems = slashMatch
    ? filterSlashItems(
        slashMatch,
        skills.map((s) => ({ name: s.name, description: s.description })),
        commands.map((c) => ({ name: c.name, description: c.description })),
        agents.map((a) => ({ name: a.slug, description: a.name })),
      )
    : [];
  const menu =
    slashMatch && !menuDismissed && menuItems.length > 0
      ? { match: slashMatch, items: menuItems, selected: Math.min(menuSelected, menuItems.length - 1) }
      : null;

  const closeMenu = () => {
    setMenuDismissed(true);
    setMenuSelected(0);
  };

  useEffect(() => {
    setMenuDismissed(false);
    setMenuSelected(0);
  }, [input]);

  const pickMenuItem = (item: SlashMenuItem | undefined): boolean => {
    if (!item || !slashMatch) return false;
    const { text, cursor: nextCursor } = applySlashPick(input, slashMatch, item);
    setInput(text);
    setCursorPos(nextCursor);
    setMenuDismissed(true);
    setMenuSelected(0);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
    return true;
  };

  const checkSlashName = (message: string): boolean => {
    const slash = /^\/(skill|command):(\S+)/.exec(message);
    if (!slash) return true;
    const [, kind, name] = slash;
    const known =
      kind === "skill"
        ? skills.some((s) => s.name === name)
        : commands.some((c) => c.name === name);
    if (!known && (skills.length > 0 || commands.length > 0)) {
      toast.error(t("chat.unknownSlashCommand", { name }));
      return false;
    }
    return true;
  };

  const send = () => {
    const message = input.trim();
    if (!message || streaming || loading || attachBusy) return;
    if (menu && !pickMenuItem(menu.items[menu.selected])) return;
    if (!checkSlashName(message)) return;
    const sent = onSend(message, files.length > 0 ? files : undefined);
    if (!sent) return;
    setInput("");
    setFiles([]);
    localStorage.removeItem(draftKey);
    setManualExpanded(false);
    closeMenu();
  };

  const handleAttachClick = () => {
    if (attachBusy) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (selected.length === 0 || !client) return;
    setUploadingCount((count) => count + selected.length);
    try {
      const settled = await Promise.allSettled(
        selected.map(async (file): Promise<AttachedFile> => {
          if (file.type.startsWith("image/")) {
            const { blob, width, height } = await compressImage(file);
            const res = await client.uploadAttachment(blob, {
              filename: file.name,
              width,
              height,
            });
            return {
              kind: "image",
              path: res.path,
              mimeType: "image/jpeg",
              name: file.name,
              size: res.bytes,
              width,
              height,
              previewUrl: client.getPreviewUrl(res.path),
            };
          }
          const res = await client.uploadAttachment(file, { filename: file.name });
          return {
            kind: "file",
            path: res.path,
            mimeType: res.mimeType ?? file.type,
            name: file.name,
            size: res.bytes,
            previewUrl: client.getPreviewUrl(res.path),
          };
        }),
      );
      const uploaded = settled
        .filter((result): result is PromiseFulfilledResult<AttachedFile> => result.status === "fulfilled")
        .map((result) => result.value);
      const failed = selected.filter((_, index) => settled[index].status === "rejected");
      if (uploaded.length > 0) setFiles((prev) => [...prev, ...uploaded]);
      if (failed.length > 0) {
        toast.error(
          t("chat.someFilesAttachFailed", { names: failed.map((file) => file.name).join("、") }),
        );
      }
    } catch (err) {
      toast.error(t("chat.fileAttachFailed", { message: (err as Error).message }));
    } finally {
      setUploadingCount((count) => Math.max(0, count - selected.length));
    }
  };

  const handleRemoveFile = (path: string) => {
    setFiles((prev) => prev.filter((file) => file.path !== path));
    if (client) {
      void client.deleteAttachment(path).catch(() => {});
    }
  };

  useEffect(() => {
    if (!streaming && !loading) textareaRef.current?.focus();
  }, [streaming, loading]);

  return (
    <div className="border-t border-border bg-background p-3" data-chat-composer>
      <div className="flex items-center gap-2 px-1 pb-2">
        <SessionModelPill sessionId={sessionId} />
      </div>
      {(files.length > 0 || attachBusy) && (
        <AttachmentBar files={files} uploading={attachBusy} onRemove={handleRemoveFile} />
      )}
      <div className="relative rounded-lg border border-input bg-background transition-colors focus-within:border-ring" data-chat-composer-input>
        {menu && (
          <div
            role="listbox"
            className="absolute inset-x-2 bottom-full z-50 mb-1 max-h-56 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            {menu.items.map((item, index) => (
              <button
                key={`${item.kind}:${item.name}`}
                type="button"
                role="option"
                aria-selected={index === menu.selected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickMenuItem(item)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs outline-hidden select-none ${index === menu.selected ? "bg-accent text-accent-foreground" : ""}`}
              >
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {item.kind === "agent" ? ">>" : `/${item.kind}:`}
                </span>
                <span className="truncate font-medium">{item.name}</span>
                {item.description && (
                  <span className="truncate text-muted-foreground">{item.description}</span>
                )}
              </button>
            ))}
          </div>
        )}
        <Textarea
          ref={textareaRef}
          className="min-h-0 w-full resize-none border-none bg-transparent py-2 ps-3 pe-8 text-sm md:text-sm leading-5 shadow-none focus-visible:ring-0"
          style={{ height: `${MIN_HEIGHT}px`, overflowY: "hidden" }}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            syncCursor(event.target);
          }}
          onSelect={(event) => syncCursor(event.currentTarget)}
          onClick={(event) => syncCursor(event.currentTarget)}
          onKeyUp={(event) => syncCursor(event.currentTarget)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          placeholder={t("chat.composerPlaceholder")}
          enterKeyHint={isTouchKeyboard ? "enter" : "send"}
          onKeyDown={(event) => {
            if (menu) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setMenuSelected((prev) =>
                  event.key === "ArrowDown"
                    ? (prev + 1) % menu.items.length
                    : (prev - 1 + menu.items.length) % menu.items.length,
                );
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                pickMenuItem(menu.items[menu.selected]);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                closeMenu();
                return;
              }
            }
            if (
              !isTouchKeyboard &&
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              !composingRef.current
            ) {
              event.preventDefault();
              send();
            }
          }}
          disabled={loading}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.txt,.md,.markdown,.json,text/plain,text/markdown,application/json"
          className="hidden"
          onChange={handleFileChange}
        />
        {contentExceeds3Lines && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-1.5 end-2.5"
            onClick={() => setManualExpanded((value) => !value)}
            title={manualExpanded ? t("chat.collapse") : t("chat.expand")}
          >
            {manualExpanded ? <ChevronsDownIcon /> : <ChevronsUpIcon />}
          </Button>
        )}
        <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
          <Button
            variant="ghost"
            size="icon"
            disabled={attachBusy}
            onClick={handleAttachClick}
            title={t("chat.attachFile")}
          >
            {attachBusy ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />}
          </Button>
          {streaming ? (
            <Button
              variant="destructive"
              size="icon-lg"
              onClick={onAbort}
              title={t("chat.stop")}
              aria-label={t("chat.stop")}
            >
              <SquareIcon />
            </Button>
          ) : (
            <Button
              size="icon-lg"
              onClick={send}
              disabled={!input.trim() || attachBusy}
              title={t("chat.send")}
              aria-label={t("chat.send")}
            >
              <SendIcon />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
