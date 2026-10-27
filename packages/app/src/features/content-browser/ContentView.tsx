import { type RefObject, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useI18n } from "@spherse/i18n/react";
import { toast } from "sonner";
import { MarkdownContent } from "../../components/markdown-content/MarkdownContent";
import { Textarea } from "../../components/ui/textarea";
import { useProjectCtx } from "../../context/project-context";
import { useApiClient } from "../../lib/use-connection";
import { mergeRefs } from "../../lib/utils";
import { useOpenExternalLink } from "../browser/open-external-url";
import { EditFindReplaceBar } from "./EditFindReplaceBar";
import { parseMarkdownToc } from "./markdown-toc";
import { cancelCenter, scheduleCenter } from "./textarea-reveal";
import { FindBar } from "../../components/find-bar/FindBar";
import { FrontMatterPanel } from "./FrontMatterPanel";
import { TocPanel } from "./TocPanel";
import { useContentToc } from "./useContentToc";
import { UnsupportedFileCard } from "./UnsupportedFileCard";
import { resolveMarkdownImagePath } from "./image-path";
import { resolveMarkdownLink } from "./markdown-link";
import { parseFrontmatter } from "./frontmatter";

interface ContentViewProps {
  filePath: string;
  content: string | null;
  binary: boolean;
  contentRef?: RefObject<HTMLDivElement | null>;
  loading: boolean;
  error: string | null;
  isMarkdown: boolean;
  isHtml: boolean;
  isImage: boolean;
  htmlView: "preview" | "source";
  isEditing: boolean;
  editedContent: string;
  onEditedContentChange: (content: string) => void;
  refreshKey: number;
  containerRef?: RefObject<HTMLDivElement | null>;
  onNavigate?: (filePath: string) => void;
  findOpen?: boolean;
  onFindOpenChange?: (open: boolean) => void;
  tocOpen?: boolean;
  editFindOpen?: boolean;
  onEditFindOpenChange?: (open: boolean) => void;
  onTaskToggle?: (taskIndex: number, checked: boolean) => void;
}

export function ContentView({
  filePath,
  content,
  binary,
  contentRef,
  loading,
  error,
  isMarkdown,
  isHtml,
  isImage,
  htmlView,
  isEditing,
  editedContent,
  onEditedContentChange,
  refreshKey,
  containerRef,
  onNavigate,
  findOpen: findOpenProp,
  onFindOpenChange,
  tocOpen = false,
  editFindOpen: editFindOpenProp,
  onEditFindOpenChange,
  onTaskToggle,
}: ContentViewProps) {
  const { t } = useI18n();
  const { projectId } = useProjectCtx();
  const client = useApiClient(projectId);
  const openLink = useOpenExternalLink();
  const navigate = useNavigate();
  const { frontmatter, body } = useMemo(
    () => (isMarkdown && content ? parseFrontmatter(content) : { frontmatter: null, body: content ?? "" }),
    [isMarkdown, content],
  );
  const resolveImageSrc = useCallback(
    (src: string) => {
      const projectPath = resolveMarkdownImagePath(src, filePath);
      return client.getPreviewUrl(projectPath);
    },
    [filePath, client],
  );
  const handleLinkClick = useCallback(
    async (href: string, event: React.MouseEvent<HTMLAnchorElement>) => {
      const resolved = resolveMarkdownLink(href, filePath);
      if (resolved.kind === "external") {
        event.preventDefault();
        openLink(href);
        return;
      }
      if (resolved.kind === "anchor") {
        event.preventDefault();
        if (resolved.anchor) {
          document.getElementById(resolved.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }
      event.preventDefault();
      if (!resolved.path) return;
      const existing = await client.getContent(resolved.path);
      if (!existing) {
        toast.error(t("content-browser.linkNotFound", { path: resolved.path }));
        return;
      }
      if (onNavigate) {
        onNavigate(resolved.path);
        return;
      }
      navigate(`/project/${projectId}/content?path=${encodeURIComponent(resolved.path)}`);
    },
    [filePath, client, projectId, navigate, onNavigate, t, openLink],
  );

  const findEnabled =
    !isEditing &&
    !loading &&
    !error &&
    !binary &&
    content !== null &&
    !isImage &&
    !(isHtml && htmlView === "preview");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const tocVisible = tocOpen && isMarkdown && !loading && !error && !binary && content !== null;
  const readTocVisible = tocVisible && !isEditing;
  const editTocVisible = tocOpen && isEditing && isMarkdown && !loading && !error && !binary;
  const tocEntries = useContentToc(scrollRef, `${filePath}#${refreshKey}`, readTocVisible);
  const deferredEdited = useDeferredValue(editedContent);
  const editTocEntries = useMemo(
    () => (isEditing && tocOpen ? parseMarkdownToc(deferredEdited) : []),
    [isEditing, tocOpen, deferredEdited],
  );
  const editFrameRef = useRef<number | null>(null);

  const handleEditTocJump = useCallback(
    (index: number) => {
      const entry = editTocEntries[index];
      const textarea = textareaRef.current;
      if (!entry || !textarea) return;
      const lineEnd = textarea.value.indexOf("\n", entry.offset);
      const end =
        lineEnd === -1
          ? textarea.value.length
          : textarea.value[lineEnd - 1] === "\r"
            ? lineEnd - 1
            : lineEnd;
      textarea.setSelectionRange(entry.offset, end);
      textarea.focus({ preventScroll: true });
      scheduleCenter(textarea, entry.offset, editFrameRef);
    },
    [editTocEntries],
  );

  useEffect(() => () => cancelCenter(editFrameRef), []);
  const [internalFindOpen, setInternalFindOpen] = useState(false);
  const findOpen = (findOpenProp ?? internalFindOpen) && findEnabled;
  const setFindOpen = onFindOpenChange ?? setInternalFindOpen;
  const [internalEditFindOpen, setInternalEditFindOpen] = useState(false);
  const editFindOpen = editFindOpenProp ?? internalEditFindOpen;
  const setEditFindOpen = onEditFindOpenChange ?? setInternalEditFindOpen;

  useEffect(() => {
    if (!findEnabled) setFindOpen(false);
  }, [findEnabled, setFindOpen]);

  useEffect(() => {
    if (!findEnabled) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        const active = document.activeElement;
        if (containerRef && (!containerRef.current || !active || !containerRef.current.contains(active))) return;
        event.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [findEnabled, setFindOpen, containerRef]);

  useEffect(() => {
    if (!isEditing) setEditFindOpen(false);
  }, [isEditing, setEditFindOpen]);

  useEffect(() => {
    if (!isEditing) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        const active = document.activeElement;
        if (containerRef && (!containerRef.current || !active || !containerRef.current.contains(active))) return;
        event.preventDefault();
        setEditFindOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditing, setEditFindOpen, containerRef]);

  if (isHtml && htmlView === "preview" && !isEditing && !loading && !error) {
    return (
      <iframe
        key={refreshKey}
        src={client.getPreviewUrl(filePath)}
        className="flex-1 w-full border-0"
        title="HTML Preview"
      />
    );
  }

  if (isImage && !loading && !error) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-auto bg-muted p-4">
        <img
          key={refreshKey}
          src={client.getPreviewUrl(filePath)}
          alt={filePath}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {editFindOpen && (
          <EditFindReplaceBar
            text={editedContent}
            textareaRef={textareaRef}
            onReplace={onEditedContentChange}
            onClose={() => setEditFindOpen(false)}
          />
        )}
        <div className="flex min-h-0 flex-1 flex-row">
          <Textarea
            ref={textareaRef}
            className="min-h-0 min-w-0 flex-1 resize-none rounded-none border-none bg-background p-4 font-mono !text-base leading-relaxed shadow-none focus-visible:ring-0"
            value={editedContent}
            onChange={(event) => onEditedContentChange(event.target.value)}
            spellCheck={false}
          />
          {editTocVisible && (
            <TocPanel
              entries={editTocEntries.map((entry, idx) => ({
                id: `edit-${idx}`,
                text: entry.text,
                level: entry.level,
              }))}
              onJump={handleEditTocJump}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {findOpen && (
        <FindBar
          containerRef={scrollRef}
          contentKey={`${filePath}#${refreshKey}`}
          onClose={() => setFindOpen(false)}
        />
      )}
      <div className="flex min-h-0 flex-1 flex-row">
        <div ref={mergeRefs(contentRef, scrollRef)} className="min-w-0 flex-1 overflow-y-auto p-4">
          {loading && <p className="p-8 text-center text-muted-foreground">{t("common.loading")}</p>}
          {error && <p className="p-8 text-center break-words text-destructive">{error}</p>}
          {!loading && !error && binary && <UnsupportedFileCard filePath={filePath} />}
          {!loading && !error && !binary && content !== null && (
            isMarkdown ? (
              <div data-content-doc className="rounded-lg border border-border bg-card p-6 text-card-foreground">
                {frontmatter && <FrontMatterPanel data={frontmatter} />}
                <MarkdownContent variant="document" resolveImageSrc={resolveImageSrc} onLinkClick={handleLinkClick} onTaskToggle={onTaskToggle}>{body}</MarkdownContent>
              </div>
            ) : (
              <pre className="break-words rounded-lg border border-border bg-card p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap">{content}</pre>
            )
          )}
        </div>
        {readTocVisible && <TocPanel entries={tocEntries} containerRef={scrollRef} />}
      </div>
    </div>
  );
}
