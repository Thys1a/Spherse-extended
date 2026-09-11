import { useState } from "react";
import { FolderCogIcon } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { useI18n } from "@spherse/i18n/react";
import { FileTree } from "../../components/file-tree";
import { AiReadDenylistDialog } from "./AiReadDenylistDialog";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "../../components/ui/sidebar";
import { useHostBridge } from "../../context/host-bridge-context";
import { useProjectCtx } from "../../context/project-context";
import { useFeature } from "../../lib/use-feature";
import { dispatchAction } from "../../ui-sdk";
import { useFloatedFilePaths } from "../floating-content-browser";
import { useTabStore } from "../tabs/tab-store";

export function UserFilePanel() {
  const { projectId } = useProjectCtx();
  const bridge = useHostBridge();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [aiDenylistOpen, setAiDenylistOpen] = useState(false);
  const { t } = useI18n();
  const contentPath = searchParams.get("path") ?? undefined;
  const canMutate = bridge.capabilities.content.editable;
  const floatEnabled = useFeature("floating-content-browser");
  const tabsEnabled = useFeature("tabs");
  const floatedFilePaths = useFloatedFilePaths(projectId);

  const handleSelectFile = (filePath: string) => {
    if (!projectId) return;
    navigate(`/project/${projectId}/content?path=${encodeURIComponent(filePath)}`);
  };

  const handleFileDeleted = (deletedPaths: string[]) => {
    if (contentPath && deletedPaths.some((p) => contentPath === p || contentPath.startsWith(`${p}/`))) {
      if (projectId) navigate(`/project/${projectId}`);
    }
  };

  const handleRenamed = (oldPath: string, newPath: string) => {
    if (!contentPath || !projectId) return;
    if (contentPath === oldPath || contentPath.startsWith(`${oldPath}/`)) {
      navigate(`/project/${projectId}/content?path=${encodeURIComponent(newPath + contentPath.slice(oldPath.length))}`);
    }
  };

  return (
    <>
      <div className="border-b border-sidebar-border p-2">
        <SidebarGroup className="px-0 py-0">
          <SidebarGroupLabel className="h-7 px-0 text-[11px] font-semibold tracking-wide uppercase">
            {t("project-panel.files")}
          </SidebarGroupLabel>
          {canMutate && (
            <SidebarGroupAction
              className="top-1 right-0"
              onClick={() => setAiDenylistOpen(true)}
              title={t("project-panel.aiReadDenylistTooltip")}
            >
              <FolderCogIcon />
            </SidebarGroupAction>
          )}
          <SidebarGroupContent>
            <FileTree
              selectedFilePath={contentPath}
              onSelectFile={handleSelectFile}
              onDeleted={handleFileDeleted}
              onRenamed={handleRenamed}
              floatedFilePaths={floatEnabled ? floatedFilePaths : undefined}
              onOpenInNewTab={
                tabsEnabled
                  ? (path) => {
                      if (!projectId) return;
                      useTabStore.getState().openTab(
                        projectId,
                        { kind: "content", label: path.split("/").pop() ?? path, filePath: path },
                        { force: true },
                      );
                    }
                  : undefined
              }
              onFloatFile={
                floatEnabled
                  ? (path) => {
                      const ctx = { navigate, projectId, hostKind: bridge.kind, client: null, openExternal: bridge.openExternal };
                      if (floatedFilePaths.has(path)) dispatchAction("unfloatContent", { path }, ctx);
                      else dispatchAction("floatContent", { path }, ctx);
                    }
                  : undefined
              }
              readOnly={!canMutate}
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </div>
      {canMutate && <AiReadDenylistDialog open={aiDenylistOpen} onOpenChange={setAiDenylistOpen} />}
    </>
  );
}
