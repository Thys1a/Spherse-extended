import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { useI18n } from "@spherse/i18n/react";
import { FloatTitleBar } from "../components/float-window/FloatTitleBar";
import { ContentView } from "../features/content-browser/ContentView";
import { classifyFileKind } from "../features/content-browser/file-kind";
import { useContentFile } from "../features/content-browser/hooks/useContentFile";
import { useDataLinkedRefresh } from "../features/chat/hooks/useDataLinkedRefresh";
import { useHostBridge } from "../context/host-bridge-context";
import { useApiClient } from "../lib/use-connection";

export function FloatContentPage() {
  const { projectId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const bridge = useHostBridge();
  const filePath = searchParams.get("path") ?? "";
  const client = useApiClient(projectId);
  const { content, binary, loading, error, dataUpdatedAt, reload } = useContentFile(
    projectId,
    client,
    filePath,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const { isMarkdown, isHtml, isImage } = classifyFileKind(filePath);
  const dataRevision = useDataLinkedRefresh(
    projectId,
    null,
    isHtml && typeof content === "string" ? content : null,
  );
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  });
  useEffect(() => {
    if (dataRevision > 0) reloadRef.current();
  }, [dataRevision]);

  useEffect(() => {
    setRefreshKey((k) => k + 1);
  }, [dataUpdatedAt, filePath]);

  useEffect(() => {
    if (!filePath) {
      void bridge.floatWindow?.closeSelf().catch(() => undefined);
    }
  }, [filePath, bridge]);

  useEffect(() => {
    if (filePath && !loading && content === null && error) {
      void bridge.floatWindow?.closeSelf({ forget: true }).catch(() => undefined);
    }
  }, [filePath, loading, content, error, bridge]);

  const fileName = filePath.split("/").pop() ?? filePath;
  const navigateMain = (route: string) => {
    void bridge.floatWindow?.navigateMain(route).catch(() => undefined);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FloatTitleBar
        title={fileName}
        onDock={() => {
          void bridge.floatWindow?.closeSelf({ dock: true }).catch(() => undefined);
        }}
        onExpand={() => {
          navigateMain(`/project/${projectId}/content?path=${encodeURIComponent(filePath)}`);
        }}
        onClose={() => {
          void bridge.floatWindow?.closeSelf().catch(() => undefined);
        }}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {filePath ? (
          <ContentView
            filePath={filePath}
            content={content}
            binary={binary}
            loading={loading}
            error={error}
            isMarkdown={isMarkdown}
            isHtml={isHtml}
            isImage={isImage}
            htmlView="preview"
            isEditing={false}
            editedContent=""
            onEditedContentChange={() => {}}
            refreshKey={refreshKey}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <p>{t("common.loading")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
