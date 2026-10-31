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
  userValue: string[] | undefined;
  onUserChange: (next: string[] | undefined) => void;
}

function useFoldedToggle(
  allNames: string[],
  value: string[] | undefined,
  onChange: (next: string[] | undefined) => void,
  options?: { preserveHidden?: boolean; absentMeansAll?: boolean },
) {
  const absentMeansAll = options?.absentMeansAll ?? true;
  const checked = (name: string) =>
    value === undefined ? absentMeansAll : value.includes(name);

  const toggle = (name: string, on: boolean) => {
    const fallback = absentMeansAll ? allNames : [];
    const base = options?.preserveHidden
      ? (value ?? fallback)
      : (value ?? fallback).filter((n) => allNames.includes(n));
    const next = on ? [...base, name] : base.filter((n) => n !== name);
    const unique = [...new Set(next)];
    if (absentMeansAll && unique.length === allNames.length && allNames.every((n) => unique.includes(n))) {
      onChange(undefined);
      return;
    }
    onChange(unique);
  };

  return { checked, toggle };
}

function SkillToggleGroup({
  title,
  hint,
  items,
  value,
  onChange,
  preserveHidden = false,
  absentMeansAll = true,
}: {
  title: string;
  hint: string;
  items: { name: string; description?: string }[];
  value: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
  preserveHidden?: boolean;
  absentMeansAll?: boolean;
}) {
  const allNames = useMemo(() => items.map((s) => s.name), [items]);
  const { checked, toggle } = useFoldedToggle(allNames, value, onChange, {
    preserveHidden,
    absentMeansAll,
  });

  return (
    <Field>
      <HintLabel hint={hint}>{title}</HintLabel>
      <div className="flex flex-col gap-2">
        {items.map((skill) => (
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

export function AgentSkillsField({ skills, value, onChange, userValue, onUserChange }: AgentSkillsFieldProps) {
  const { t } = useI18n();
  const projectSkills = useMemo(() => (skills ?? []).filter((s) => s.source !== "user"), [skills]);
  const userSkills = useMemo(() => (skills ?? []).filter((s) => s.source === "user"), [skills]);

  if (projectSkills.length === 0 && userSkills.length === 0) return null;

  return (
    <>
      {projectSkills.length > 0 && (
        <SkillToggleGroup
          title={t("agent-dialog.skillsLabel")}
          hint={t("agent-dialog.skillsHint")}
          items={projectSkills}
          value={value}
          onChange={onChange}
        />
      )}
      {userSkills.length > 0 && (
        <SkillToggleGroup
          title={t("agent-dialog.userSkillsLabel")}
          hint={t("agent-dialog.userSkillsHint")}
          items={userSkills}
          value={userValue}
          onChange={onUserChange}
          preserveHidden
          absentMeansAll={false}
        />
      )}
    </>
  );
}
