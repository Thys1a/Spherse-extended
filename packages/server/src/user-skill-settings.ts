import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listSkillsInDir, type UserSkillSource } from "@spherse/core";
import type { UserSkillSettingsResponse } from "@spherse/contracts";

interface ResolvedUserSkillSource extends UserSkillSource {
  custom: boolean;
}

export function resolveDefaultUserSkillSources(homeDir: string = os.homedir()): ResolvedUserSkillSource[] {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
  return [
    { key: "agents", dir: path.join(homeDir, ".agents", "skills"), custom: false },
    { key: "claude", dir: path.join(homeDir, ".claude", "skills"), custom: false },
    { key: "opencode", dir: path.join(configHome, "opencode", "skills"), custom: false },
    { key: "codex", dir: path.join(homeDir, ".codex", "skills"), custom: false },
  ];
}

export function normalizeSkillDir(raw: string, homeDir: string = os.homedir()): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const expanded =
    trimmed === "~" ? homeDir : trimmed.startsWith("~/") ? path.join(homeDir, trimmed.slice(2)) : trimmed;
  if (!path.isAbsolute(expanded)) return null;
  return path.normalize(expanded);
}

function cleanDirList(value: unknown, homeDir: string = os.homedir()): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = normalizeSkillDir(entry, homeDir);
    if (!normalized) continue;
    out.push(normalized);
  }
  return [...new Set(out)];
}

function normalizeSettings(raw: unknown): { customDirs: string[]; enabled: string[] } {
  if (typeof raw !== "object" || raw === null) return { customDirs: [], enabled: [] };
  const data = raw as { customDirs?: unknown; enabled?: unknown };
  return { customDirs: cleanDirList(data.customDirs), enabled: cleanDirList(data.enabled) };
}

export class UserSkillSettingsStore {
  private readonly filePath?: string;
  private settings: { customDirs: string[]; enabled: string[] };

  constructor(options?: { filePath?: string }) {
    this.filePath = options?.filePath;
    this.settings = this.readFromDisk();
  }

  private readFromDisk(): { customDirs: string[]; enabled: string[] } {
    if (!this.filePath) return { customDirs: [], enabled: [] };
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      return normalizeSettings(JSON.parse(raw));
    } catch {
      return { customDirs: [], enabled: [] };
    }
  }

  get(): { customDirs: string[]; enabled: string[] } {
    return this.settings;
  }

  isEnabled(skillDir: string): boolean {
    const normalized = normalizeSkillDir(skillDir);
    if (!normalized) return false;
    return this.settings.enabled.includes(normalized);
  }

  private async pruneDeadEnabled(): Promise<void> {
    const live: string[] = [];
    for (const dir of this.settings.enabled) {
      try {
        const real = await fs.promises.realpath(dir);
        const stat = await fs.promises.stat(real);
        if (stat.isDirectory()) live.push(dir);
      } catch {
        continue;
      }
    }
    if (live.length !== this.settings.enabled.length) {
      this.settings = { ...this.settings, enabled: live };
      if (this.filePath) this.writeToDisk(this.settings);
    }
  }

  applyUpdate(update: { customDirs?: string[]; enabled?: string[] }): { customDirs: string[]; enabled: string[] } {
    const next = {
      customDirs:
        update.customDirs === undefined ? this.settings.customDirs : cleanDirList(update.customDirs),
      enabled: update.enabled === undefined ? this.settings.enabled : cleanDirList(update.enabled),
    };
    this.settings = next;
    if (this.filePath) this.writeToDisk(next);
    return next;
  }

  async scan(homeDir: string = os.homedir()): Promise<UserSkillSettingsResponse> {
    const defaults = resolveDefaultUserSkillSources(homeDir);
    const custom = cleanDirList(this.settings.customDirs, homeDir).map((dir, index) => ({
      key: `custom-${index}`,
      dir,
      custom: true as const,
    }));
    const sources = [...custom, ...defaults];
    await this.pruneDeadEnabled();
    const seen = new Set<string>();
    const result: UserSkillSettingsResponse["sources"] = [];
    for (const source of sources) {
      if (seen.has(source.dir)) continue;
      seen.add(source.dir);
      let exists = false;
      const skills: { name: string; description: string; dir: string; enabled: boolean }[] = [];
      try {
        const stat = await fs.promises.stat(source.dir);
        exists = stat.isDirectory();
      } catch {
        exists = false;
      }
      if (exists) {
        const found = await listSkillsInDir(source.dir, "user");
        for (const skill of found) {
          const dir = path.dirname(skill.filePath);
          skills.push({
            name: skill.name,
            description: skill.description,
            dir,
            enabled: this.isEnabled(dir),
          });
        }
      }
      result.push({ ...source, exists, skills });
    }
    return { customDirs: this.settings.customDirs, enabled: this.settings.enabled, sources: result };
  }

  private writeToDisk(settings: { customDirs: string[]; enabled: string[] }): void {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
    fs.chmodSync(this.filePath, 0o600);
  }
}
