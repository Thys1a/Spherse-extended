import { describe, expect, it, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { CommandStore } from "../../store/command.js";
import { ConflictError, NotFoundError, ValidationError } from "../../errors.js";

describe("CommandStore", () => {
  let tmpDir: string;
  let store: CommandStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cmd-"));
    store = new CommandStore(path.join(tmpDir, ".spherse", "commands"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists empty when the directory is missing", async () => {
    expect(await store.list()).toEqual([]);
  });

  it("creates, reads, updates and deletes a command", async () => {
    const created = await store.create({
      name: "test",
      description: "Run tests",
      model: "openai/gpt-4o",
      template: "Run $ARGUMENTS with coverage",
    });
    expect(created).toMatchObject({
      name: "test",
      description: "Run tests",
      model: "openai/gpt-4o",
      template: "Run $ARGUMENTS with coverage",
    });

    expect(await store.get("test")).toMatchObject({ name: "test" });
    expect((await store.list()).map((c) => c.name)).toEqual(["test"]);

    const updated = await store.update("test", { template: "Run $1 now" });
    expect(updated.template).toBe("Run $1 now");
    expect(updated.model).toBe("openai/gpt-4o");

    await store.delete("test");
    expect(await store.get("test")).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it("rejects duplicate creation", async () => {
    await store.create({ name: "dup", template: "x" });
    await expect(store.create({ name: "dup", template: "y" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects invalid names and empty templates", async () => {
    await expect(store.create({ name: "  ", template: "x" })).rejects.toBeInstanceOf(ValidationError);
    await expect(store.create({ name: "a/b", template: "x" })).rejects.toBeInstanceOf(ValidationError);
    await expect(store.create({ name: ".hidden", template: "x" })).rejects.toBeInstanceOf(ValidationError);
    await expect(store.create({ name: "empty", template: "   " })).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws NotFoundError for missing update/delete targets", async () => {
    await expect(store.update("nope", { template: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(store.delete("nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("skips files with empty templates on list", async () => {
    const dir = path.join(tmpDir, ".spherse", "commands");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "empty.md"), "---\ndescription: x\n---\n");
    fs.writeFileSync(path.join(dir, "good.md"), "hello");
    expect((await store.list()).map((c) => c.name)).toEqual(["good"]);
  });
});
