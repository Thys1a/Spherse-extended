import fs from "node:fs/promises";
import path from "node:path";
import { llmAccessPolicy } from "../access/access-policy.js";
import type { Capability } from "../kernel/capability.js";
import type { ProjectStore } from "../store/project.js";
import type { SlashMeta } from "./events.js";
import { resolveProjectPath } from "../utils/path-safety.js";
import { ValidationError } from "../errors.js";
import { DEFAULT_TEXT_ATTACHMENT_BUDGET } from "../attachments/text-processor.js";

export type SlashKind = "skill" | "command";

export interface ParsedSlash {
  kind: SlashKind;
  name: string;
  rawArgs: string;
}

export interface SlashExpansion {
  text: string;
  slash: SlashMeta;
  modelOverride?: string;
}

export interface SlashDeps {
  projectStore: ProjectStore;
  capabilities: ReadonlyArray<Capability>;
}

const SLASH_RE = /^\/(skill|command):(\S+)(?:\s+(.*))?$/s;
const ARG_REF_RE = /\$ARGUMENTS|\$[1-9]/g;
const FILE_REF_RE = /@([^\s]+)/g;

export function parseSlashCommand(text: string): ParsedSlash | null {
  const match = SLASH_RE.exec(text.trim());
  if (!match) return null;
  return {
    kind: match[1] as SlashKind,
    name: match[2],
    rawArgs: (match[3] ?? "").trim(),
  };
}

export async function expandSlashMessage(
  deps: SlashDeps,
  agentId: string,
  text: string,
): Promise<SlashExpansion | null> {
  const parsed = parseSlashCommand(text);
  if (!parsed) return null;
  if (parsed.kind === "skill") {
    return expandSkill(deps, agentId, parsed);
  }
  return expandCommand(deps, parsed);
}

async function expandSkill(
  deps: SlashDeps,
  agentId: string,
  parsed: ParsedSlash,
): Promise<SlashExpansion> {
  const agentStore = deps.projectStore.getAgent(agentId);
  const skill =
    (await agentStore?.skills.get(parsed.name)) ??
    (await deps.projectStore.skill.get(parsed.name));
  if (!skill) {
    throw new ValidationError(`Skill "${parsed.name}" not found`);
  }
  const projectRoot = deps.projectStore.getRootPath();
  let expanded = `<skill-content name="${skill.name}">\n${skill.instructions}`;
  if (skill.source === "project" && skill.files.length > 0) {
    const skillDirRel = path
      .relative(projectRoot, path.dirname(skill.filePath))
      .split(path.sep)
      .join("/");
    const fileList = skill.files.map((f) => `- ${skillDirRel}/${f}`).join("\n");
    expanded += `\n\n## Skill Files\n\nThis skill has companion files you can read with the read_file tool:\n${fileList}`;
  }
  expanded += `\n</skill-content>`;
  if (parsed.rawArgs) expanded += `\n\n${parsed.rawArgs}`;
  return {
    text: expanded,
    slash: { type: "skill", name: parsed.name, rawArgs: parsed.rawArgs },
  };
}

async function expandCommand(deps: SlashDeps, parsed: ParsedSlash): Promise<SlashExpansion> {
  const command = await deps.projectStore.commands.get(parsed.name);
  if (!command) {
    throw new ValidationError(`Command "${parsed.name}" not found`);
  }
  const args = parsed.rawArgs ? parsed.rawArgs.split(/\s+/) : [];
  let expanded = command.template.replace(ARG_REF_RE, (ref) => {
    if (ref === "$ARGUMENTS") return parsed.rawArgs;
    const index = Number(ref.slice(1)) - 1;
    if (index >= args.length) {
      throw new ValidationError(
        `Command "${parsed.name}" requires argument $${index + 1} but none was provided`,
      );
    }
    return args[index];
  });
  expanded = await expandFileRefs(deps, expanded);
  return {
    text: expanded,
    slash: { type: "command", name: parsed.name, rawArgs: parsed.rawArgs },
    ...(command.model ? { modelOverride: command.model } : {}),
  };
}

async function expandFileRefs(deps: SlashDeps, text: string): Promise<string> {
  const matches = [...text.matchAll(FILE_REF_RE)];
  if (matches.length === 0) return text;
  const projectRoot = deps.projectStore.getRootPath();
  const policy = llmAccessPolicy(
    projectRoot,
    deps.projectStore.config.getAiAccessSettings().deniedPaths,
    deps.capabilities.flatMap((c) => c.pathRules ?? []),
  );
  let result = text;
  for (const match of matches) {
    const ref = match[1];
    let resolved: string;
    try {
      resolved = resolveProjectPath(projectRoot, ref);
    } catch {
      throw new ValidationError(`Referenced file is outside the project: ${ref}`);
    }
    if (!policy.canRead(ref)) {
      throw new ValidationError(`Referenced file is not readable: ${ref}`);
    }
    let content: string;
    try {
      content = await fs.readFile(resolved, "utf-8");
    } catch {
      throw new ValidationError(`Referenced file not found: ${ref}`);
    }
    const shown =
      content.length > DEFAULT_TEXT_ATTACHMENT_BUDGET
        ? `${content.slice(0, DEFAULT_TEXT_ATTACHMENT_BUDGET)}\n…[truncated]`
        : content;
    result = result.replace(match[0], `\n<file path="${ref}">\n${shown}\n</file>`);
  }
  return result;
}
