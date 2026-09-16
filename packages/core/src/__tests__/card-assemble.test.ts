import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assembleProject, type ProjectRuntime } from "../factory.js";
import { createSilentLogger } from "../logger.js";

function cardJson(): string {
  return JSON.stringify(
    {
      spec: "chara_card_v3",
      spec_version: "3.0",
      name: "asm",
      data: {
        name: "asm",
        extensions: {},
        character_book: {
          name: "asm book",
          entries: [
            {
              id: 0,
              keys: ["k"],
              secondary_keys: [],
              comment: "c0",
              content: "hello",
              constant: false,
              selective: true,
              insertion_order: 1,
              enabled: true,
              position: "after_char",
              use_regex: false,
              extensions: {},
            },
          ],
        },
      },
    },
    null,
    2,
  );
}

describe("card store assembly contract (real ProjectRuntime, no mocks)", () => {
  let tmpDir: string;
  let runtime: ProjectRuntime;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spherse-card-asm-"));
    fs.writeFileSync(path.join(tmpDir, "asm.card.json"), cardJson());
    runtime = await assembleProject(tmpDir, { logger: createSilentLogger() });
  });

  afterAll(async () => {
    await runtime.shutdown();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("runtime exposes a working CardStore", async () => {
    expect(runtime.cardStore).toBeDefined();
    const meta = await runtime.cardStore!.meta("asm.card.json");
    expect(meta).toMatchObject({ spec: "chara_card_v3", name: "asm", entryCount: 1 });
    const r = await runtime.cardStore!.updateEntry("asm.card.json", 0, { comment: "c0!" });
    expect(r).toEqual({ id: 0, changed: ["comment"] });
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, "asm.card.json"), "utf8"));
    expect(onDisk.data.character_book.entries[0].comment).toBe("c0!");
  });
});
