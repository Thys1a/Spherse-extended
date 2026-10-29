import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@spherse/i18n/react";
import type { UserSkillSettingsResponse } from "@spherse/contracts";
import { Button } from "../../components/ui/button";
import { Field, FieldGroup } from "../../components/ui/field";
import { Switch } from "../../components/ui/switch";
import { useGlobalApiClient } from "../../lib/use-connection";
import { useHostBridge } from "../../context/host-bridge-context";
import { SectionTitle } from "./SectionTitle";

type UserSkillSource = UserSkillSettingsResponse["sources"][number];

const KNOWN_SOURCE_KEYS = ["agents", "claude", "opencode", "codex"] as const;
type KnownSourceKey = (typeof KNOWN_SOURCE_KEYS)[number];

function isKnownSourceKey(key: string): key is KnownSourceKey {
  return (KNOWN_SOURCE_KEYS as readonly string[]).includes(key);
}

function sourceLabel(source: UserSkillSource, t: (key: `settings.userSkills.sources.${KnownSourceKey}`) => string): string {
  if (!source.custom && isKnownSourceKey(source.key)) {
    return t(`settings.userSkills.sources.${source.key}`);
  }
  return source.dir;
}

export function UserSkillsPanel() {
  const { t } = useI18n();
  const bridge = useHostBridge();
  const globalClient = useGlobalApiClient();
  const [settings, setSettings] = useState<UserSkillSettingsResponse | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!globalClient) return;
    let cancelled = false;
    globalClient
      .getUserSkillSettings()
      .then((res) => {
        if (!cancelled) setSettings(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [globalClient]);

  const save = useCallback(
    async (next: { customDirs: string[]; enabled: string[] }) => {
      if (!globalClient) return;
      setPending(true);
      try {
        const res = await globalClient.updateUserSkillSettings(next);
        setSettings(res);
      } catch (err) {
        toast.error(t("settings.userSkills.saveFailed", { error: (err as Error).message }));
      } finally {
        setPending(false);
      }
    },
    [globalClient, t],
  );

  const toggleSkill = (dir: string, on: boolean) => {
    if (!settings || pending) return;
    const enabled = on
      ? [...settings.enabled, dir]
      : settings.enabled.filter((d) => d !== dir);
    void save({ customDirs: settings.customDirs, enabled });
  };

  const addCustomDir = async () => {
    const dir = await bridge.project?.selectDirectory();
    if (!dir || !settings || pending) return;
    if (settings.customDirs.includes(dir)) return;
    await save({ customDirs: [...settings.customDirs, dir], enabled: settings.enabled });
  };

  const removeCustomDir = async (dir: string) => {
    if (!settings || pending) return;
    await save({
      customDirs: settings.customDirs.filter((d) => d !== dir),
      enabled: settings.enabled.filter((d) => d !== dir && !d.startsWith(`${dir}/`)),
    });
  };

  if (!settings) return null;

  const renderSource = (source: UserSkillSource) => (
    <div key={`${source.key}:${source.dir}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-medium leading-none" title={source.dir}>
            {sourceLabel(source, t)}
          </span>
          {!source.exists && <span className="text-xs text-muted-foreground">{t("settings.userSkills.notFound")}</span>}
        </div>
        {source.custom && (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => void removeCustomDir(source.dir)}>
            {t("common.delete")}
          </Button>
        )}
      </div>
      {source.skills.map((skill) => {
        const on = settings.enabled.includes(skill.dir);
        return (
          <div key={skill.dir} className="flex items-center justify-between gap-3 py-1 pl-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-sm leading-none">{skill.name}</span>
              <span className="truncate text-xs text-muted-foreground" title={skill.description}>
                {skill.description}
              </span>
            </div>
            <Switch checked={on} disabled={pending} onCheckedChange={(checked) => toggleSkill(skill.dir, checked)} />
          </div>
        );
      })}
    </div>
  );

  return (
    <FieldGroup>
      <SectionTitle>{t("settings.userSkills.title")}</SectionTitle>
      <span className="text-xs text-muted-foreground">{t("settings.userSkills.desc")}</span>
      <Field>
        <div className="flex flex-col gap-3">
          {settings.sources.map(renderSource)}
        </div>
      </Field>
      <Button variant="outline" size="sm" disabled={pending || !bridge.project} onClick={() => void addCustomDir()}>
        {t("settings.userSkills.addCustomDir")}
      </Button>
      <span className="text-xs text-muted-foreground">{t("settings.userSkills.takesEffectNote")}</span>
    </FieldGroup>
  );
}
