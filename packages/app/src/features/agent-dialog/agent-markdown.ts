import yaml from "js-yaml";
import type { QuickReply, ThinkingLevel, TimePerceptionConfig } from "@spherse/core";

export const MAX_QUICK_REPLIES = 10;
export const MAX_QUICK_REPLY_LABEL_LENGTH = 16;

function parseQuickReplies(raw: unknown): QuickReply[] {
  if (!Array.isArray(raw)) return [];
  const out: QuickReply[] = [];
  for (const item of raw) {
    if (out.length >= MAX_QUICK_REPLIES) break;
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.label !== "string" || !obj.label.trim()) continue;
    if (typeof obj.text !== "string" || !obj.text.trim()) continue;
    out.push({
      label: obj.label.trim().slice(0, MAX_QUICK_REPLY_LABEL_LENGTH),
      ...(typeof obj.description === "string" && obj.description.trim()
        ? { description: obj.description.trim() }
        : {}),
      text: obj.text,
      action: "fill",
    });
  }
  return out;
}

export type TimePerceptionFormData = {
  enabled: boolean;
} & Partial<Omit<TimePerceptionConfig, "enabled">>;

const THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "low", "medium", "high"];

function parseThinkingLevel(raw: unknown): ThinkingLevel | undefined {
  return typeof raw === "string" && THINKING_LEVELS.includes(raw as ThinkingLevel)
    ? (raw as ThinkingLevel)
    : undefined;
}

function parseTimePerception(raw: unknown): TimePerceptionFormData | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  return {
    enabled: obj.enabled === true,
    epochMs: typeof obj.epochMs === "number" ? obj.epochMs : undefined,
    startMs: typeof obj.startMs === "number" ? obj.startMs : undefined,
    flowRate: typeof obj.flowRate === "number" ? obj.flowRate : undefined,
    timeZone: typeof obj.timeZone === "string" ? obj.timeZone : undefined,
  };
}

export interface AgentFormData {
  name: string;
  alias?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  tools: string[];
  context: string[];
  quickLinks: string[];
  quickReplies?: QuickReply[];
  systemPrompt: string;
  timePerception?: TimePerceptionFormData;
  yolo: boolean;
  allowInlineHtml: boolean;
  unlimitedAsk: boolean;
  unlimitedToolCalls: boolean;
  placeholder?: string;
  greeting?: string;
}

export interface ParsedAgent {
  formData: AgentFormData;
  extraFrontmatter: Record<string, unknown>;
}

export function parseAgentMarkdown(raw: string): ParsedAgent {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {
      formData: {
        name: "",
        alias: undefined,
        model: undefined,
        thinkingLevel: undefined,
        tools: [],
        context: [],
        quickLinks: [],
        quickReplies: [],
        systemPrompt: raw.trim(),
        yolo: false,
        allowInlineHtml: false,
        unlimitedAsk: false,
        unlimitedToolCalls: false,
      },
      extraFrontmatter: {},
    };
  }

  const frontmatterRaw = match[1];
  const body = raw.slice(match[0].length).trim();
  const frontmatter = yaml.load(frontmatterRaw) as Record<string, unknown>;

  const { name, alias, model, thinkingLevel, tools, context, quickLinks, quickReplies, timePerception, yolo, allowInlineHtml, unlimitedAsk, unlimitedToolCalls, placeholder, greeting, ...extra } = frontmatter;

  return {
    formData: {
      name: typeof name === "string" ? name : "",
      alias: typeof alias === "string" && alias.trim() ? alias : undefined,
      model: typeof model === "string" && model.trim() ? model : undefined,
      thinkingLevel: parseThinkingLevel(thinkingLevel),
      tools: Array.isArray(tools)
        ? tools.filter((t): t is string => typeof t === "string")
        : [],
      context: Array.isArray(context)
        ? context.filter((c): c is string => typeof c === "string")
        : [],
      quickLinks: Array.isArray(quickLinks)
        ? quickLinks.filter((c): c is string => typeof c === "string")
        : [],
      quickReplies: parseQuickReplies(quickReplies),
      systemPrompt: body,
      timePerception: parseTimePerception(timePerception),
      yolo: yolo === true,
      allowInlineHtml: allowInlineHtml === true,
      unlimitedAsk: unlimitedAsk === true,
      unlimitedToolCalls: unlimitedToolCalls === true,
      placeholder: typeof placeholder === "string" && placeholder.trim() ? placeholder : undefined,
      greeting: typeof greeting === "string" && greeting.trim() ? greeting : undefined,
    },
    extraFrontmatter: extra,
  };
}

export function buildAgentMarkdown(
  formData: AgentFormData,
  extraFrontmatter: Record<string, unknown>,
  _isCreate: boolean,
): string {
  const frontmatter: Record<string, unknown> = {
    ...extraFrontmatter,
    name: formData.name,
    tools: formData.tools,
  };
  if (formData.alias?.trim()) {
    frontmatter.alias = formData.alias.trim();
  }
  if (formData.model?.trim()) {
    frontmatter.model = formData.model.trim();
  }
  if (formData.thinkingLevel) {
    frontmatter.thinkingLevel = formData.thinkingLevel;
  }
  if (formData.context.length > 0) {
    frontmatter.context = formData.context;
  }
  if (formData.quickLinks.length > 0) {
    frontmatter.quickLinks = formData.quickLinks;
  }
  const quickReplies = formData.quickReplies ?? [];
  if (quickReplies.length > 0) {
    frontmatter.quickReplies = quickReplies;
  }
  if (formData.timePerception?.enabled) {
    frontmatter.timePerception = {
      enabled: true,
      epochMs: formData.timePerception.epochMs,
      startMs: formData.timePerception.startMs,
      flowRate: formData.timePerception.flowRate,
      ...(formData.timePerception.timeZone
        ? { timeZone: formData.timePerception.timeZone }
        : {}),
    };
  }
  if (formData.yolo) {
    frontmatter.yolo = true;
  }
  if (formData.allowInlineHtml) {
    frontmatter.allowInlineHtml = true;
  }
  if (formData.unlimitedAsk) {
    frontmatter.unlimitedAsk = true;
  }
  if (formData.unlimitedToolCalls) {
    frontmatter.unlimitedToolCalls = true;
  }
  if (formData.placeholder?.trim()) {
    frontmatter.placeholder = formData.placeholder.trim();
  }
  if (formData.greeting?.trim()) {
    frontmatter.greeting = formData.greeting.trim();
  }

  const cleaned = Object.fromEntries(
    Object.entries(frontmatter).filter(([, v]) => v !== undefined),
  );
  const yamlStr = yaml
    .dump(cleaned, { lineWidth: -1, quotingType: '"' })
    .trim();
  return `---\n${yamlStr}\n---\n\n${formData.systemPrompt}\n`;
}
