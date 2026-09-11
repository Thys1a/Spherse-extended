import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useI18n } from "@spherse/i18n/react";
import type { ActiveSessionInfo } from "../../lib/types";
import { useFeature } from "../../lib/use-feature";
import { useProjectNavigation } from "../../lib/use-project-navigation";
import { useApiClient } from "../../lib/use-connection";
import { useProjectDataStore } from "../../stores/project-data-store";
import { createProjectSession, useProjectCatalog, useProjectSession } from "../../queries/project";
import { Chat } from "../chat";
import { ContentBrowser } from "../content-browser";
import { BrowserPageView } from "../browser/BrowserPageView";
import { isLoopbackUrl } from "../browser/open-external-url";
import { WelcomePage } from "../welcome-page";
import { useFloatingSessionId } from "../floating-chat/use-floating-session-id";
import { useTabStore, type Tab } from "./tab-store";
import { useSplitStore } from "./split-store";

function ChatTabPanel({ projectId, tab, onClose }: { projectId: string; tab: Tab; onClose: () => void }) {
  const sessionId = tab.sessionId ?? "";
  const navigate = useNavigate();
  const { t } = useI18n();
  const client = useApiClient(projectId);
  const { sessions, agents } = useProjectCatalog(projectId, client);
  const sessionQuery = useProjectSession(projectId, client, sessionId);
  const projectData = useProjectDataStore((s) => s.projects[projectId]);
  const consumeInitialMessage = useProjectDataStore((s) => s.consumeInitialMessage);
  const closeTab = useTabStore((s) => s.closeTab);

  const session = sessionQuery.data ?? sessions.find((item) => item.id === sessionId) ?? null;
  const agent = session ? agents.find((a) => a.id === session.agentId) ?? null : null;
  const initialMessage = session ? projectData?.initialMessageBySessionId[session.id] : undefined;

  useEffect(() => {
    if (initialMessage && session) {
      consumeInitialMessage(projectId, session.id);
    }
  }, [consumeInitialMessage, initialMessage, projectId, session]);

  useEffect(() => {
    if (sessionQuery.isSuccess && sessionQuery.data === null) {
      closeTab(projectId, tab.id);
    }
  }, [closeTab, projectId, sessionQuery.data, sessionQuery.isSuccess, tab.id]);

  if (!session || !agent) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <Chat
      key={session.id}
      sessionId={session.id}
      agent={agent}
      onNavigateToPath={(path) => navigate(`/project/${projectId}/content?path=${encodeURIComponent(path)}`)}
      initialMessage={initialMessage}
      onClose={onClose}
    />
  );
}

function ContentTabPanel({ projectId, tab, onClose }: { projectId: string; tab: Tab; onClose: () => void }) {
  const filePath = tab.filePath ?? "";
  const client = useApiClient(projectId);
  const navigate = useNavigate();
  const { back } = useProjectNavigation();
  const { t } = useI18n();
  const { agents, sessions } = useProjectCatalog(projectId, client);
  const floatingSessionId = useFloatingSessionId(projectId);
  const closeTab = useTabStore((s) => s.closeTab);

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

  useEffect(() => {
    if (!filePath) closeTab(projectId, tab.id);
  }, [closeTab, filePath, projectId, tab.id]);

  if (!filePath) return null;

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
      onBack={back}
      onClose={onClose}
      agents={agents}
      activeSessions={activeSessions}
      onStartSession={handleStartSession}
      onSplit={() => useSplitStore.getState().openSplit(projectId, filePath)}
    />
  );
}

function BrowserTabPanel({ projectId, tab }: { projectId: string; tab: Tab }) {
  const { back } = useProjectNavigation();
  const browserEnabled = useFeature("browser");
  const closeTab = useTabStore((s) => s.closeTab);
  const url = tab.url ?? "";
  const allowed = browserEnabled && isLoopbackUrl(url);

  useEffect(() => {
    if (url && !allowed) closeTab(projectId, tab.id);
  }, [allowed, url, closeTab, projectId, tab.id]);

  if (!allowed) return null;
  return <BrowserPageView projectId={projectId} url={url} onBack={back} />;
}

function HomeTabPanel({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  return (
    <WelcomePage
      key={projectId}
      fallback={
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <p>{t("welcome-page.emptyState")}</p>
        </div>
      }
    />
  );
}

export function TabPanel({ projectId, tab }: { projectId: string; tab: Tab }) {
  const closeTab = useTabStore((s) => s.closeTab);
  const onClose = () => closeTab(projectId, tab.id);

  if (tab.kind === "chat") return <ChatTabPanel projectId={projectId} tab={tab} onClose={onClose} />;
  if (tab.kind === "content") return <ContentTabPanel projectId={projectId} tab={tab} onClose={onClose} />;
  if (tab.kind === "browser") return <BrowserTabPanel projectId={projectId} tab={tab} />;
  return <HomeTabPanel projectId={projectId} />;
}
