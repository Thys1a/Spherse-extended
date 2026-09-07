import { useI18n } from "@spherse/i18n/react";
import { Button } from "../../components/ui/button";
import { SquareIcon, Volume2Icon } from "lucide-react";
import { useHostBridge } from "../../context/host-bridge-context";
import { useFeature } from "../../lib/use-feature";
import { useTtsStore } from "./tts/tts-store";
import { speak, stop } from "./tts/tts-controller";
import { extractSpeechText } from "./tts/speech-text";

interface SpeakButtonProps {
  messageId: string;
  text: string;
  sessionId?: string;
}

export function SpeakButton({ messageId, text, sessionId }: SpeakButtonProps) {
  const { t, locale } = useI18n();
  const bridge = useHostBridge();
  const enabled = useFeature("tts");
  const isSpeaking = useTtsStore((s) => s.messageId === messageId && s.status === "speaking");

  if (!enabled) return null;

  const handleClick = () => {
    if (isSpeaking) {
      stop();
      return;
    }
    if (!sessionId) return;
    void (async () => {
      const settings = await bridge.getSettings();
      speak(messageId, sessionId, extractSpeechText(text), {
        voiceURI: settings?.tts?.voiceURI,
        rate: settings?.tts?.rate,
        locale,
      });
    })();
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      onClick={handleClick}
      title={isSpeaking ? t("chat.ttsStop") : t("chat.ttsSpeak")}
    >
      {isSpeaking ? <SquareIcon /> : <Volume2Icon />}
    </Button>
  );
}