import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";
import type { AgentProfile, QuickReply, ThinkingLevel, TimePerceptionConfig } from "../types.js";
import { MAX_QUICK_REPLIES, MAX_QUICK_REPLY_LABEL_LENGTH } from "../types.js";
import { ValidationError } from "../errors.js";

const THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "low", "medium", "high"];

function parseThinkingLevel(raw: unknown): ThinkingLevel | undefined {
  return typeof raw === "string" && THINKING_LEVELS.includes(raw as ThinkingLevel)
    ? (raw as ThinkingLevel)
    : undefined;
}

function parseTimePerception(raw: unknown): TimePerceptionConfig | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const enabled = obj.enabled === true;
  const epochMs = typeof obj.epochMs === "number" ? obj.epochMs : undefined;
  const startMs = typeof obj.startMs === "number" ? obj.startMs : undefined;
  const flowRate = typeof obj.flowRate === "number" ? obj.flowRate : undefined;

  if (!enabled && epochMs === undefined && startMs === undefined && flowRate === undefined) {
    return undefined;
  }

  return {
    enabled,
    epochMs: epochMs ?? Date.now(),
    startMs: startMs ?? epochMs ?? Date.now(),
    flowRate: flowRate ?? 1,
    timeZone: typeof obj.timeZone === "string" ? obj.timeZone : undefined,
  };
}

export class AgentProfileStore {
  private profilePath: string;
  private themePath: string;
  private slug: string;

  constructor(profilePath: string, slug: string) {
    this.profilePath = profilePath;
    this.themePath = path.join(path.dirname(profilePath), "theme.css");
    this.slug = slug;
  }

  async read(): Promise<AgentProfile | null> {
    return this.parseFile();
  }

  async save(content: string): Promise<AgentProfile> {
    const { data, content: body } = matter(content);
    if (typeof data.name !== "string") {
      throw new ValidationError("agent profile name is required");
    }

    const existingData = await this.readFrontmatter();
    if (existingData?.id) {
      data.id = existingData.id;
    }
    if (typeof existingData?.createdAt === "number") {
      data.createdAt = existingData.createdAt;
    } else if (typeof data.createdAt !== "number") {
      data.createdAt = Date.now();
    }
    if (!data.id) {
      data.id = crypto.randomUUID();
    }

    const serialized = matter.stringify(body, data);
    await fs.mkdir(path.dirname(this.profilePath), { recursive: true });
    await fs.writeFile(this.profilePath, serialized, "utf-8");

    return this.parseFile().then((p) => p!);
  }

  private async readFrontmatter(): Promise<Record<string, unknown> | null> {
    try {
      const raw = await fs.readFile(this.profilePath, "utf-8");
      return matter(raw).data;
    } catch {
      return null;
    }
  }

  async getTheme(): Promise<string> {
    try {
      return await fs.readFile(this.themePath, "utf-8");
    } catch {
      return "";
    }
  }

  async saveTheme(content: string): Promise<void> {
    await fs.writeFile(this.themePath, content, "utf-8");
  }

  async getRawContent(): Promise<string> {
    return fs.readFile(this.profilePath, "utf-8");
  }

  private async parseFile(): Promise<AgentProfile | null> {
    try {
      const raw = await fs.readFile(this.profilePath, "utf-8");
      const { data, content } = matter(raw);

      if (!data.name) return null;

      if (!data.id) {
        data.id = crypto.randomUUID();
        await fs.writeFile(this.profilePath, matter.stringify(content, data), "utf-8");
      }

      return {
        id: data.id,
        name: data.name,
        alias:
          typeof data.alias === "string" && data.alias.trim()
            ? data.alias
            : undefined,
        slug: this.slug,
        createdAt: data.createdAt,
        model: typeof data.model === "string" && data.model.trim() ? data.model : undefined,
        thinkingLevel: parseThinkingLevel(data.thinkingLevel),
        tools: data.tools,
        context: data.context,
        quickLinks: Array.isArray(data.quickLinks)
          ? data.quickLinks.filter((p): p is string => typeof p === "string")
          : undefined,
        quickReplies: parseQuickReplies(data.quickReplies),
        skills: Array.isArray(data.skills)
          ? data.skills.filter((s): s is string => typeof s === "string")
          : undefined,
        output: data.output,
        timePerception: parseTimePerception(data.timePerception),
        yolo: data.yolo === true || undefined,
        allowInlineHtml: data.allowInlineHtml === true || undefined,
        unlimitedAsk: data.unlimitedAsk === true || undefined,
        unlimitedToolCalls: data.unlimitedToolCalls === true || undefined,
        placeholder:
          typeof data.placeholder === "string" && data.placeholder.trim()
            ? data.placeholder
            : undefined,
        greeting:
          typeof data.greeting === "string" && data.greeting.trim()
            ? data.greeting
            : undefined,
        systemPrompt: content.trim(),
        filePath: this.profilePath,
      };
    } catch {
      return null;
    }
  }
}

export function parseQuickReplies(data: unknown): QuickReply[] | undefined {
  if (!Array.isArray(data)) return undefined;
  const out: QuickReply[] = [];
  for (const item of data) {
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
  return out.length > 0 ? out : undefined;
}

export function assertSafeSlug(slug: string): void {
  if (
    !slug.trim() ||
    slug !== slug.trim() ||
    slug.includes("..") ||
    slug.includes("/") ||
    slug.includes("\\")
  ) {
    throw new ValidationError("invalid agent slug");
  }
}
