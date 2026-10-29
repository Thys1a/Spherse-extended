import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { fsCapability } from "../../capabilities/fs/index.js";
import { ProjectStore } from "../../store/project.js";
import { createSilentLogger } from "../../logger.js";
import { FileWriteMutex } from "../../utils/file-write-mutex.js";
import { createTempProject, cleanupDir, writeFile } from "../helpers.js";

describe("fsCapability read_file user-skill roots follow the agent allowlist", () => {
  let projectRoot: string;
  let userRoot: string;
  let store: ProjectStore;
  let companionAbs: string;

  beforeEach(async () => {
    projectRoot = await createTempProject();
    userRoot = await createTempProject();
    await writeFile(
      userRoot,
      "personal/SKILL.md",
      "---\nname: personal\ndescription: Personal\n---\n\nBody.",
    );
    await writeFile(userRoot, "personal/ref.md", "companion content");
    companionAbs = path.join(userRoot, "personal", "ref.md");
    store = new ProjectStore(projectRoot, createSilentLogger(), new FileWriteMutex(), {
      userSkills: { sources: () => [{ key: "t", dir: userRoot }], isEnabled: () => true },
    });
    await store.create("TestProject");
  });

  afterEach(async () => {
    store.close();
    await cleanupDir(projectRoot);
    await cleanupDir(userRoot);
  });

  function readFileTool(profile: { userSkills?: string[] }) {
    const host = {
      agentId: "a1",
      profile,
      projectRoot,
      projectStore: store,
      fileWriteMutex: new FileWriteMutex(),
      pathRules: [],
    } as never;
    const tool = fsCapability().tools!(host).find((t) => t.name === "read_file")!;
    return tool;
  }

  it("reads the companion file when the agent follows the global switch", async () => {
    const result = await readFileTool({}).execute("tc1", { path: companionAbs }, undefined as any);
    expect(result.content[0].text).toBe("companion content");
  });

  it("reads the companion file when named in the agent allowlist", async () => {
    const result = await readFileTool({ userSkills: ["personal"] }).execute(
      "tc1",
      { path: companionAbs },
      undefined as any,
    );
    expect(result.content[0].text).toBe("companion content");
  });

  it("rejects the companion file when the agent allowlist is empty", async () => {
    await expect(
      readFileTool({ userSkills: [] }).execute("tc1", { path: companionAbs }, undefined as any),
    ).rejects.toThrow();
  });
});
