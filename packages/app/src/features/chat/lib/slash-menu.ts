export type SlashMenuItemKind = "skill" | "command" | "agent";

export interface SlashMenuItem {
  kind: SlashMenuItemKind;
  name: string;
  description?: string;
}

export interface SlashMenuMatch {
  start: number;
  end: number;
  query: string;
  kinds: SlashMenuItemKind[];
}

export interface NamedEntry {
  name: string;
  description?: string;
}

const TOKEN_RE = /(^|\s)(\/(?:skill|command)?:?[^\s]*|>>[^\s]*)$/;

function isSlashPrefix(body: string): boolean {
  if (body === "") return true;
  if (body.startsWith("skill:") || body.startsWith("command:")) return true;
  return "skill:".startsWith(body) || "command:".startsWith(body);
}

export function matchSlashToken(textBeforeCursor: string): SlashMenuMatch | null {
  const match = TOKEN_RE.exec(textBeforeCursor);
  if (!match) return null;
  const token = match[2];
  const start = match.index + match[1].length;
  if (token.startsWith(">>")) {
    return { start, end: textBeforeCursor.length, query: token.slice(2), kinds: ["agent"] };
  }
  const body = token.slice(1);
  if (!isSlashPrefix(body)) return null;
  if (body.startsWith("skill:")) {
    return { start, end: textBeforeCursor.length, query: body.slice("skill:".length), kinds: ["skill"] };
  }
  if (body.startsWith("command:")) {
    return { start, end: textBeforeCursor.length, query: body.slice("command:".length), kinds: ["command"] };
  }
  return { start, end: textBeforeCursor.length, query: "", kinds: ["skill", "command"] };
}

export function filterSlashItems(
  match: SlashMenuMatch,
  skills: NamedEntry[],
  commands: NamedEntry[],
  agents: NamedEntry[],
): SlashMenuItem[] {
  const query = match.query.toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(query);
  const items: SlashMenuItem[] = [];
  if (match.kinds.includes("skill")) {
    for (const skill of skills.filter((s) => matches(s.name))) {
      items.push({ kind: "skill", name: skill.name, description: skill.description });
    }
  }
  if (match.kinds.includes("command")) {
    for (const command of commands.filter((c) => matches(c.name))) {
      items.push({ kind: "command", name: command.name, description: command.description });
    }
  }
  if (match.kinds.includes("agent")) {
    for (const agent of agents.filter((a) => matches(a.name))) {
      items.push({ kind: "agent", name: agent.name, description: agent.description });
    }
  }
  return items.slice(0, 8);
}

export function applySlashPick(
  input: string,
  match: SlashMenuMatch,
  item: SlashMenuItem,
): { text: string; cursor: number } {
  const replacement = item.kind === "agent" ? `>>${item.name} ` : `/${item.kind}:${item.name} `;
  const text = `${input.slice(0, match.start)}${replacement}${input.slice(match.end)}`;
  return { text, cursor: match.start + replacement.length };
}

export const SUMMON_MESSAGE_RE = /^>>\s*(\S+)\s+([\s\S]+)$/;

export function parseSummonMessage(text: string): { targetSlug: string; message: string } | null {
  const match = SUMMON_MESSAGE_RE.exec(text.trim());
  if (!match) return null;
  return { targetSlug: match[1], message: match[2].trim() };
}
