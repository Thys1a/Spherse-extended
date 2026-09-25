import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { XIcon } from "lucide-react";
import { useI18n } from "@spherse/i18n/react";
import type { AgentSummary } from "../../lib/types";
import { FloatingFrame } from "../../components/floating-frame";
import { Chat } from "../chat";
import { stopIfSession } from "../chat/tts/tts-controller";
import { PetComposer } from "./PetComposer";
import { useFloatingChatStore, type FloatingChatState } from "./store";
import { FLOAT_PET_HEIGHT, FLOAT_PET_WIDTH } from "./defaults";

interface FloatingChatContainerProps {
  projectId: string;
  floatingChat: FloatingChatState;
  agent: AgentSummary;
}

export function FloatingChatContainer({
  projectId,
  floatingChat,
  agent,
}: FloatingChatContainerProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const setFloatingChat = useFloatingChatStore((s) => s.setFloatingChat);

  const handleClose = () => {
    setFloatingChat(projectId, null);
  };

  const handleFullMode = () => {
    setFloatingChat(projectId, { ...floatingChat, mode: "full" });
  };

  const handlePetMode = () => {
    stopIfSession(floatingChat.sessionId);
    setFloatingChat(projectId, { ...floatingChat, mode: "pet" });
  };

  const handleExpand = () => {
    setFloatingChat(projectId, null);
    navigate(`/project/${projectId}/chat/${floatingChat.sessionId}`);
  };

  const handlePositionCommit = (pos: { x: number; y: number }) => {
    setFloatingChat(projectId, { ...floatingChat, position: pos });
  };

  const handleSizeCommit = (size: { width: number; height: number }, pos: { x: number; y: number }) => {
    setFloatingChat(projectId, { ...floatingChat, position: pos, size });
  };

  const avatarInitial = (agent.alias || agent.name).trim().charAt(0).toUpperCase() || "?";

  if (floatingChat.mode === "pet") {
    return createPortal(
      <div className="floating-chat-portal">
        <FloatingFrame
          hookPrefix="chat"
          title={agent.name}
          position={floatingChat.position}
          size={{ width: FLOAT_PET_WIDTH, height: FLOAT_PET_HEIGHT }}
          onPositionCommit={handlePositionCommit}
          onClose={handleClose}
          variant="pet"
        >
          <div className="group/pet relative flex h-full flex-col">
            <div className="flex flex-1 items-center justify-center" data-pet-avatar>
              <button
                type="button"
                onClick={handleFullMode}
                title={t("floating-chat.exitPetMode")}
                aria-label={t("floating-chat.exitPetMode")}
                className="flex size-20 items-center justify-center rounded-full bg-primary text-2xl text-primary-foreground select-none"
              >
                {avatarInitial}
              </button>
            </div>
            <PetComposer sessionId={floatingChat.sessionId} agentId={agent.id} />
            <div className="invisible absolute inset-x-0 top-0 flex items-center justify-end gap-1 bg-background/60 p-1.5 group-hover/pet:visible group-focus-within/pet:visible">
              <button
                type="button"
                onClick={handleClose}
                title={t("common.close")}
                aria-label={t("common.close")}
                className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          </div>
        </FloatingFrame>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="floating-chat-portal">
      <FloatingFrame
        hookPrefix="chat"
        title={agent.name}
        position={floatingChat.position}
        size={floatingChat.size}
        onPositionCommit={handlePositionCommit}
        onSizeCommit={handleSizeCommit}
        onClose={handleClose}
        onExpand={handleExpand}
        onTogglePet={handlePetMode}
        petToggleTitle={t("floating-chat.enterPetMode")}
      >
        <Chat
          key={floatingChat.sessionId}
          sessionId={floatingChat.sessionId}
          agent={agent}
          hideHeader
          onNavigateToPath={(path) => {
            navigate(`/project/${projectId}/content?path=${encodeURIComponent(path)}`);
          }}
          onOpenSession={(targetSessionId) => {
            navigate(`/project/${projectId}/chat/${targetSessionId}`);
          }}
        />
      </FloatingFrame>
    </div>,
    document.body,
  );
}
