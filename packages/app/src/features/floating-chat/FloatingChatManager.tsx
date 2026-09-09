import { useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useProjectCtx } from "../../context/project-context";
import { useFeature } from "../../lib/use-feature";
import { useFloatingChatStore } from "./store";
import { FloatingChatContainer } from "./FloatingChatContainer";
import { useApiClient } from "../../lib/use-connection";
import { useProjectCatalog, useProjectSession } from "../../queries/project";

export function FloatingChatManager() {
  const { projectId } = useProjectCtx();
  const { sessionId: routeSessionId } = useParams();
  const navigate = useNavigate();
  const floatingChat = useFloatingChatStore((s) =>
    projectId ? s.byProject[projectId] : undefined,
  );
  const client = useApiClient(projectId);
  const { sessions, agents } = useProjectCatalog(projectId, client);
  const floatingSessionQuery = useProjectSession(projectId, client, floatingChat?.sessionId);
  const setFloatingChat = useFloatingChatStore((s) => s.setFloatingChat);
  const tabsEnabled = useFeature("tabs");

  const session = floatingChat
    ? floatingSessionQuery.data ?? sessions.find((item) => item.id === floatingChat.sessionId)
    : undefined;

  useEffect(() => {
    if (floatingChat && projectId && floatingSessionQuery.isSuccess && !session) {
      setFloatingChat(projectId, null);
    }
  }, [floatingChat, floatingSessionQuery.isSuccess, projectId, session, setFloatingChat]);

  useEffect(() => {
    if (floatingChat && routeSessionId === floatingChat.sessionId && !tabsEnabled) {
      navigate(`/project/${projectId}`);
    }
  }, [floatingChat, routeSessionId, navigate, projectId, tabsEnabled]);

  if (!floatingChat || !session) return null;

  const agent = agents.find((a) => a.id === session.agentId);
  if (!agent) return null;

  return (
    <FloatingChatContainer
      projectId={projectId}
      floatingChat={floatingChat}
      agent={agent}
    />
  );
}
