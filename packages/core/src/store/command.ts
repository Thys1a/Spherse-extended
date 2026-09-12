import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { CommandDefinition } from "../types.js";
import { isPathInside } from "../utils/path-safety.js";
import { FileWriteMutex } from "../utils/file-write-mutex.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";

const INVALID_COMMAND_NAME_RE = /[/\\:]/;

export interface CommandInput {
  name: string;
  description?: string;
  model?: string;
  template: string;
}

export interface CommandPatch {
  description?: string;
  model?: string;
  template?: string;
}

export class CommandStore {
  private commandsDir: string;
  private fileWriteMutex: FileWriteMutex;

  constructor(commandsDir: string, fileWriteMutex?: FileWriteMutex) {
    this.commandsDir = path.resolve(commandsDir);
    this.fileWriteMutex = fileWriteMutex ?? new FileWriteMutex();
  }

  async list(): Promise<CommandDefinition[]> {
    let entries;
    try {
      entries = await fs.readdir(this.commandsDir, { withFileTypes: true });
    } catch {
      return [];
    }
    const files = entries.filter((e) => e.isFile() && e.name.endsWith(".md"));
    const commands = await Promise.all(files.map((f) => this.parseCommand(f.name)));
    return commands
      .filter((c): c is CommandDefinition => c !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(name: string): Promise<CommandDefinition | null> {
    const trimmed = name.trim();
    if (!trimmed || INVALID_COMMAND_NAME_RE.test(trimmed)) return null;
    return this.parseCommand(`${trimmed}.md`);
  }

  async create(input: CommandInput): Promise<CommandDefinition> {
    const name = this.assertValidCommandName(input.name);
    const template = input.template.trim();
    if (!template) throw new ValidationError("command template is required");
    const filePath = path.join(this.commandsDir, `${name}.md`);

    await this.fileWriteMutex.run(filePath, async () => {
      if (await this.exists(filePath)) {
        throw new ConflictError(`Command "${name}" already exists`);
      }
      await fs.mkdir(this.commandsDir, { recursive: true });
      await fs.writeFile(filePath, this.render(input.description, input.model, template), "utf-8");
    });

    const created = await this.get(name);
    if (!created) throw new Error(`command "${name}" not found after creation`);
    return created;
  }

  async update(name: string, patch: CommandPatch): Promise<CommandDefinition> {
    const trimmed = this.assertValidCommandName(name);
    const filePath = path.join(this.commandsDir, `${trimmed}.md`);
    const current = await this.get(trimmed);
    if (!current) throw new NotFoundError(`Command "${trimmed}" not found`);

    const description = patch.description !== undefined ? patch.description.trim() : (current.description ?? "");
    const model = patch.model !== undefined ? patch.model.trim() || undefined : current.model;
    const template = patch.template !== undefined ? patch.template.trim() : current.template;
    if (!template) throw new ValidationError("command template is required");

    await this.fileWriteMutex.run(filePath, async () => {
      if (!(await this.exists(filePath))) {
        throw new NotFoundError(`Command "${trimmed}" not found`);
      }
      await fs.writeFile(filePath, this.render(description || undefined, model, template), "utf-8");
    });

    const updated = await this.get(trimmed);
    if (!updated) throw new Error(`command "${trimmed}" not found after update`);
    return updated;
  }

  async delete(name: string): Promise<void> {
    const trimmed = this.assertValidCommandName(name);
    const filePath = path.join(this.commandsDir, `${trimmed}.md`);
    await this.fileWriteMutex.run(filePath, async () => {
      if (!(await this.exists(filePath))) {
        throw new NotFoundError(`Command "${trimmed}" not found`);
      }
      await fs.rm(filePath);
    });
  }

  private assertValidCommandName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) throw new ValidationError("command name is required");
    if (INVALID_COMMAND_NAME_RE.test(trimmed)) {
      throw new ValidationError("command name must not contain '/', '\\', or ':'");
    }
    if (trimmed.startsWith(".")) {
      throw new ValidationError("command name must not start with '.'");
    }
    return trimmed;
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private render(description: string | undefined, model: string | undefined, template: string): string {
    const frontmatter: Record<string, string> = {};
    if (description) frontmatter.description = description;
    if (model) frontmatter.model = model;
    return matter.stringify(template, frontmatter);
  }

  private async parseCommand(fileName: string): Promise<CommandDefinition | null> {
    const filePath = path.resolve(this.commandsDir, fileName);
    if (!isPathInside(this.commandsDir, filePath)) return null;
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const { data, content } = matter(raw);
      const template = content.trim();
      if (!template) return null;
      const description =
        typeof data.description === "string" && data.description.trim()
          ? data.description.trim()
          : undefined;
      const model =
        typeof data.model === "string" && data.model.trim() ? data.model.trim() : undefined;
      return {
        name: path.basename(fileName, ".md"),
        ...(description !== undefined ? { description } : {}),
        ...(model !== undefined ? { model } : {}),
        template,
        filePath,
      };
    } catch {
      return null;
    }
  }
}
