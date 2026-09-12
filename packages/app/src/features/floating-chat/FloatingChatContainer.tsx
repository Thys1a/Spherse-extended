import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { Maximize2Icon, XIcon } from "lucide-react";
import { useI18n } from "@spherse/i18n/react";
import type { AgentSummary } from "../../lib/types";
import { FloatingFrame } from "../../components/floating-frame";
import { Chat } from "../chat";
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

  const avatarInitial = (agent.alias || agent.name).trim().charAt(0) || "?";

  if (floatingChat.mode === "pet") {
    return createPortal(
      <div className="floating-chat-portal">
        <FloatingFrame
          key="pet"
          hookPrefix="chat"
          title={agent.name}
          position={floatingChat.position}
          size={{ width: FLOAT_PET_WIDTH, height: FLOAT_PET_HEIGHT }}
          onPositionCommit={handlePositionCommit}
          onSizeCommit={handleSizeCommit}
          onClose={handleClose}
          variant="pet"
        >
          <div className="group/pet relative flex h-full flex-col">
            <div className="flex flex-1 items-center justify-center" data-pet-avatar>
              <span className="flex size-20 items-center justify-center rounded-full bg-primary text-2xl text-primary-foreground select-none">
                {avatarInitial}
              </span>
            </div>
            <PetComposer sessionId={floatingChat.sessionId} agentId={agent.id} />
            <div className="invisible absolute inset-x-0 top-0 flex items-center justify-end gap-1 bg-background/60 p-1.5 group-hover/pet:visible">
              <button
                type="button"
                onClick={handleFullMode}
                title={t("floating-chat.exitPetMode")}
                aria-label={t("floating-chat.exitPetMode")}
                className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted"
              >
                <Maximize2Icon className="size-3.5" />
              </button>
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
        key="full"
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
