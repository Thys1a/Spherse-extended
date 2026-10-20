import { useI18n } from "@spherse/i18n/react";
import { Button } from "../../components/ui/button";
import { SquareIcon, Volume2Icon } from "lucide-react";
import { useFeature } from "../../lib/use-feature";
import { useSettingsStore } from "../../stores/settings-store";
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
  const enabled = useFeature("tts");
  const isSpeaking = useTtsStore((s) => s.messageId === messageId && s.status === "speaking");

  if (!enabled) return null;

  const handleClick = () => {
    if (isSpeaking) {
      stop();
      return;
    }
    if (!sessionId) return;
    const tts = useSettingsStore.getState().tts;
    speak(messageId, sessionId, extractSpeechText(text), {
      voiceURI: tts?.voiceURI,
      rate: tts?.rate,
      locale,
    });
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