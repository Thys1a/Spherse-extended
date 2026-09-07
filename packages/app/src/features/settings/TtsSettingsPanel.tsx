import { useEffect, useState } from "react";
import { useI18n } from "@spherse/i18n/react";
import type { TtsSettings } from "@spherse/core";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import { NativeSelect, NativeSelectOption } from "../../components/ui/native-select";
import { Switch } from "../../components/ui/switch";
import { Input } from "../../components/ui/input";
import { SectionTitle } from "./SectionTitle";
import { loadVoices } from "../chat/tts/tts-controller";

export function TtsSettingsPanel({
  tts,
  onChange,
}: {
  tts: TtsSettings;
  onChange: (patch: Partial<TtsSettings>) => void;
}) {
  const { t } = useI18n();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => loadVoices());

  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) return;
    const update = () => setVoices(loadVoices());
    update();
    synth.onvoiceschanged = update;
    return () => {
      synth.onvoiceschanged = null;
    };
  }, []);

  return (
    <FieldGroup className="mt-5">
      <SectionTitle>{t("settings.tts.title")}</SectionTitle>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium leading-none">{t("settings.tts.autoRead")}</span>
          <span className="text-xs text-muted-foreground">{t("settings.tts.autoReadDesc")}</span>
        </div>
        <Switch
          checked={tts.autoRead ?? false}
          onCheckedChange={(checked) => onChange({ autoRead: checked })}
        />
      </div>
      <Field className="mt-3">
        <FieldLabel>{t("settings.tts.voice")}</FieldLabel>
        <NativeSelect
          className="w-full"
          value={tts.voiceURI ?? ""}
          onChange={(e) => onChange({ voiceURI: e.target.value || undefined })}
        >
          <NativeSelectOption value="">{t("settings.tts.voiceDefault")}</NativeSelectOption>
          {voices.map((voice) => (
            <NativeSelectOption key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name} ({voice.lang})
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field className="mt-3">
        <FieldLabel>{t("settings.tts.rate")}</FieldLabel>
        <Input
          type="number"
          min={0.5}
          max={2}
          step={0.1}
          value={tts.rate ?? 1}
          onChange={(e) => onChange({ rate: Number(e.target.value) || undefined })}
        />
      </Field>
    </FieldGroup>
  );
}