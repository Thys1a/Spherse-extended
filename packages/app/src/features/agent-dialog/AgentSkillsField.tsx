import { useMemo } from "react";
import { useI18n } from "@spherse/i18n/react";
import type { SkillSummaryContract as SkillSummary } from "@spherse/contracts";
import { HintLabel } from "./HintLabel";
import { Switch } from "../../components/ui/switch";
import { Field } from "../../components/ui/field";

interface AgentSkillsFieldProps {
  skills: SkillSummary[] | undefined;
  value: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
}

export function AgentSkillsField({ skills, value, onChange }: AgentSkillsFieldProps) {
  const { t } = useI18n();
  const projectSkills = useMemo(() => (skills ?? []).filter((s) => s.source !== "user"), [skills]);
  const allNames = useMemo(() => projectSkills.map((s) => s.name), [projectSkills]);
  const checked = (name: string) => value === undefined || value.includes(name);

  const toggle = (name: string, on: boolean) => {
    const base = (value ?? allNames).filter((n) => allNames.includes(n));
    const next = on ? [...base, name] : base.filter((n) => n !== name);
    const unique = [...new Set(next)];
    onChange(unique.length === allNames.length && allNames.every((n) => unique.includes(n)) ? undefined : unique);
  };

  if (projectSkills.length === 0) return null;

  return (
    <Field>
      <HintLabel hint={t("agent-dialog.skillsHint")}>{t("agent-dialog.skillsLabel")}</HintLabel>
      <div className="flex flex-col gap-2">
        {projectSkills.map((skill) => (
          <div key={skill.name} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm">{skill.name}</span>
              {skill.description ? (
                <span className="truncate text-xs text-muted-foreground">{skill.description}</span>
              ) : null}
            </div>
            <Switch checked={checked(skill.name)} onCheckedChange={(v) => toggle(skill.name, v)} />
          </div>
        ))}
      </div>
    </Field>
  );
}
