import { useEffect } from "react";
import { useParams } from "react-router";
import { useI18n } from "@spherse/i18n/react";
import { Chat } from "../features/chat";
import { FloatTitleBar } from "../components/float-window/FloatTitleBar";
import { useHostBridge } from "../context/host-bridge-context";
import { useApiClient } from "../lib/use-connection";
import { useProjectAgents, useProjectSession } from "../queries/project";

export function FloatChatPage() {
  const { projectId = "", sessionId = "" } = useParams();
  const { t } = useI18n();
  const bridge = useHostBridge();
  const client = useApiClient(projectId);
  const { agents } = useProjectAgents(projectId, client);
  const sessionQuery = useProjectSession(projectId, client, sessionId);
  const session = sessionQuery.data ?? null;
  const agent = session ? agents.find((a) => a.id === session.agentId) ?? null : null;

  const navigateMain = (route: string) => {
    void bridge.floatWindow?.navigateMain(route).catch(() => undefined);
  };
  const handleDock = () => {
    void bridge.floatWindow?.closeSelf({ dock: true }).catch(() => undefined);
  };
  const handleClose = () => {
    void bridge.floatWindow?.closeSelf().catch(() => undefined);
  };

  useEffect(() => {
    if (sessionQuery.isSuccess && !session) {
      void bridge.floatWindow?.closeSelf({ forget: true }).catch(() => undefined);
    }
  }, [sessionQuery.isSuccess, session, bridge]);

  if (!session || !agent) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <FloatTitleBar title="" onDock={handleDock} onClose={handleClose} />
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <p>{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FloatTitleBar
        title={agent.name}
        onDock={handleDock}
        onExpand={() => navigateMain(`/project/${projectId}/chat/${session.id}`)}
        onClose={handleClose}
      />
      <div className="min-h-0 flex-1">
        <Chat
          key={session.id}
          sessionId={session.id}
          agent={agent}
          hideHeader
          onNavigateToPath={(path) => {
            navigateMain(`/project/${projectId}/content?path=${encodeURIComponent(path)}`);
          }}
          onOpenSession={(targetSessionId) => {
            navigateMain(`/project/${projectId}/chat/${targetSessionId}`);
          }}
        />
      </div>
    </div>
  );
}
