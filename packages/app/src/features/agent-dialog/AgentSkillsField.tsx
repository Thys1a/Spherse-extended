import { useMemo, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { useI18n } from "@spherse/i18n/react";
import type { SkillSummaryContract as SkillSummary } from "@spherse/contracts";
import { HintLabel } from "./HintLabel";
import { Switch } from "../../components/ui/switch";
import { Field } from "../../components/ui/field";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";

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
  checked,
  toggle,
  defaultOpen = true,
}: {
  title: string;
  hint: string;
  items: { name: string; description?: string }[];
  checked: (name: string) => boolean;
  toggle: (name: string, on: boolean) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Field>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="inline-flex w-full items-center gap-1 text-sm font-medium">
          <ChevronDownIcon
            className="size-3.5 transition-transform"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          />
          {title}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 flex flex-col gap-2">
            <HintLabel hint={hint}>{title}</HintLabel>
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
        </CollapsibleContent>
      </Collapsible>
    </Field>
  );
}

export function AgentSkillsField({ skills, value, onChange, userValue, onUserChange }: AgentSkillsFieldProps) {
  const { t } = useI18n();
  const builtinSkills = useMemo(() => (skills ?? []).filter((s) => s.source === "builtin"), [skills]);
  const projectSkills = useMemo(
    () => (skills ?? []).filter((s) => s.source !== "user" && s.source !== "builtin"),
    [skills],
  );
  const userSkills = useMemo(() => (skills ?? []).filter((s) => s.source === "user"), [skills]);
  const projectNames = useMemo(
    () => [...projectSkills, ...builtinSkills].map((s) => s.name),
    [projectSkills, builtinSkills],
  );
  const { checked: projectChecked, toggle: projectToggle } = useFoldedToggle(
    projectNames,
    value,
    onChange,
  );
  const userNames = useMemo(() => userSkills.map((s) => s.name), [userSkills]);
  const { checked: userChecked, toggle: userToggle } = useFoldedToggle(userNames, userValue, onUserChange, {
    preserveHidden: true,
    absentMeansAll: false,
  });

  if (projectSkills.length === 0 && builtinSkills.length === 0 && userSkills.length === 0) return null;

  return (
    <>
      {builtinSkills.length > 0 && (
        <SkillToggleGroup
          title={t("agent-dialog.builtinSkillsLabel")}
          hint={t("agent-dialog.builtinSkillsHint")}
          items={builtinSkills}
          checked={projectChecked}
          toggle={projectToggle}
          defaultOpen={false}
        />
      )}
      {projectSkills.length > 0 && (
        <SkillToggleGroup
          title={t("agent-dialog.skillsLabel")}
          hint={t("agent-dialog.skillsHint")}
          items={projectSkills}
          checked={projectChecked}
          toggle={projectToggle}
        />
      )}
      {userSkills.length > 0 && (
        <SkillToggleGroup
          title={t("agent-dialog.userSkillsLabel")}
          hint={t("agent-dialog.userSkillsHint")}
          items={userSkills}
          checked={userChecked}
          toggle={userToggle}
        />
      )}
    </>
  );
}
