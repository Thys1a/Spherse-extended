import fs from "node:fs";
import path from "node:path";
import type { WebSearchSettings } from "@spherse/core";
import { WEB_SEARCH_API_KEY_ENV, WEB_SEARCH_BASE_URL_ENV, WEB_SEARCH_MODEL_ENV } from "@spherse/core";
import type { WebSearchSettingsRequest, WebSearchSettingsResponse } from "@spherse/contracts";

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeSettings(raw: unknown): WebSearchSettings {
  if (typeof raw !== "object" || raw === null) return {};
  const data = raw as Partial<WebSearchSettings>;
  const next: WebSearchSettings = {};
  const apiKey = cleanText(data.apiKey);
  const baseUrl = cleanText(data.baseUrl);
  const model = cleanText(data.model);
  if (apiKey) next.apiKey = apiKey;
  if (baseUrl) next.baseUrl = baseUrl;
  if (model) next.model = model;
  return next;
}

export class WebSearchSettingsStore {
  private readonly filePath?: string;
  private settings: WebSearchSettings;

  constructor(options?: { filePath?: string }) {
    this.filePath = options?.filePath;
    this.settings = this.readFromDisk();
  }

  private readFromDisk(): WebSearchSettings {
    if (!this.filePath) return {};
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      return normalizeSettings(JSON.parse(raw));
    } catch {
      return {};
    }
  }

  get(): WebSearchSettings {
    return this.settings;
  }

  sanitize(): WebSearchSettingsResponse {
    return {
      apiKey: { configured: Boolean(this.settings.apiKey?.trim()) },
      baseUrl: this.settings.baseUrl ?? null,
      model: this.settings.model ?? null,
    };
  }

  applyUpdate(request: WebSearchSettingsRequest): WebSearchSettings {
    const prev = this.settings;
    const pick = (field: "apiKey" | "baseUrl" | "model"): string | undefined => {
      const incoming = request[field];
      if (incoming === undefined) return prev[field];
      const cleaned = cleanText(incoming);
      return cleaned ?? undefined;
    };
    const next: WebSearchSettings = {};
    const apiKey = pick("apiKey");
    const baseUrl = pick("baseUrl");
    const model = pick("model");
    if (apiKey) next.apiKey = apiKey;
    if (baseUrl) next.baseUrl = baseUrl;
    if (model) next.model = model;
    if (this.filePath) this.writeToDisk(next);
    this.settings = next;
    return next;
  }

  private writeToDisk(settings: WebSearchSettings): void {
    fs.mkdirSync(path.dirname(this.filePath!), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, this.filePath!);
    fs.chmodSync(this.filePath!, 0o600);
  }
}

export function applyWebSearchEnv(search: WebSearchSettings | undefined): void {
  const apiKey = search?.apiKey?.trim();
  if (apiKey) process.env[WEB_SEARCH_API_KEY_ENV] = apiKey;
  else delete process.env[WEB_SEARCH_API_KEY_ENV];
  const baseUrl = search?.baseUrl?.trim();
  if (baseUrl) process.env[WEB_SEARCH_BASE_URL_ENV] = baseUrl;
  else delete process.env[WEB_SEARCH_BASE_URL_ENV];
  const model = search?.model?.trim();
  if (model) process.env[WEB_SEARCH_MODEL_ENV] = model;
  else delete process.env[WEB_SEARCH_MODEL_ENV];
}
