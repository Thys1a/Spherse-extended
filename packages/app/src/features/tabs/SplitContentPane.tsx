import { useNavigate } from "react-router";
import { useI18n } from "@spherse/i18n/react";
import type { ActiveSessionInfo } from "../../lib/types";
import { useApiClient } from "../../lib/use-connection";
import { createProjectSession, useProjectCatalog } from "../../queries/project";
import { ContentBrowser } from "../content-browser";
import { useFloatingSessionId } from "../floating-chat/use-floating-session-id";
import { useSplitStore } from "./split-store";

export function SplitContentPane({ projectId, filePath }: { projectId: string; filePath: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const client = useApiClient(projectId);
  const { agents, sessions } = useProjectCatalog(projectId, client);
  const floatingSessionId = useFloatingSessionId(projectId);
  const closeSplit = useSplitStore((s) => s.closeSplit);
  const setFile = useSplitStore((s) => s.setFile);

  const activeSessions: ActiveSessionInfo[] = [];
  if (floatingSessionId) {
    const floatingSession = sessions.find((s) => s.id === floatingSessionId);
    const floatingAgent = floatingSession ? agents.find((a) => a.id === floatingSession.agentId) : null;
    if (floatingSession && floatingAgent) {
      activeSessions.push({
        sessionId: floatingSession.id,
        agentName: floatingAgent.name,
        sessionTitle: floatingSession.title,
        floating: true,
      });
    }
  }

  const handleStartSession = async (
    agentId: string,
    selectedText: string,
    sourcePath: string,
    comment?: string,
  ) => {
    const quotedText = selectedText.split("\n").map((line) => `> ${line}`).join("\n");
    const parts = [t("text-selection.promptPrefix", { path: sourcePath, text: quotedText })];
    if (comment) parts.push(`\n\n${comment}`);
    const message = parts.join("");
    const session = await createProjectSession(projectId, client, agentId, message).catch(() => null);
    if (session) {
      navigate(`/project/${projectId}/chat/${session.id}`);
    }
  };

  return (
    <ContentBrowser
      key={filePath}
      filePath={filePath}
      onBack={() => closeSplit(projectId)}
      onClose={() => closeSplit(projectId)}
      agents={agents}
      activeSessions={activeSessions}
      onStartSession={handleStartSession}
      onNavigate={(path) => setFile(projectId, path)}
    />
  );
}
