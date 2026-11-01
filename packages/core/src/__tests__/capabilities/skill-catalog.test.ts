import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { skillCapability } from "../../capabilities/skill/index.js";
import { ProjectStore } from "../../store/project.js";
import { createSilentLogger } from "../../logger.js";
import { FileWriteMutex } from "../../utils/file-write-mutex.js";
import { createTempProject, cleanupDir, writeFile } from "../helpers.js";

describe("skillCapability catalog user allowlist", () => {
  let projectRoot: string;
  let userRoot: string;
  let store: ProjectStore;

  beforeEach(async () => {
    projectRoot = await createTempProject();
    userRoot = await createTempProject();
    await writeFile(
      userRoot,
      "personal/SKILL.md",
      "---\nname: personal\ndescription: Personal\n---\n\nBody.",
    );
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

  function catalogText(profile: { userSkills?: string[] }): Promise<string> {
    const blocks = skillCapability().contextBlocks!({
      agentId: "a1",
      profile,
      projectStore: store,
    } as never);
    return blocks.then((list) => list.map((b) => b.render()).join("\n"));
  }

  it("omits the user skill when the agent has no user allowlist (default off)", async () => {
    expect(await catalogText({})).not.toContain('name="personal"');
  });

  it("lists the user skill when named in the agent allowlist", async () => {
    expect(await catalogText({ userSkills: ["personal"] })).toContain('name="personal"');
  });
});
