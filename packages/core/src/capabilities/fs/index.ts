import path from "node:path";
import type { Capability } from "../../kernel/capability.js";
import { isUserSkillAllowedForAgent } from "../../store/skill.js";
import { createReadFileTool } from "../../tools/read-file.js";
import { createWriteFileTool } from "../../tools/write-file.js";
import { createEditFileTool } from "../../tools/edit-file.js";
import { createListFilesTool } from "../../tools/list-files.js";
import { createSearchContentTool } from "../../tools/search-content.js";
import { createMoveFileTool } from "../../tools/move-file.js";
import { createCopyFileTool } from "../../tools/copy-file.js";
import { createGenerateImageTool } from "../../tools/generate-image.js";
import { llmPolicyOf } from "../shared/llm-policy.js";

export function fsCapability(): Capability {
  return {
    id: "fs",
  tools: (host) => {
    const { projectRoot, fileWriteMutex } = host;
    const getPolicy = llmPolicyOf(host);
    return [
      createReadFileTool(projectRoot, getPolicy, {
        externalReadRoots: async () => {
          const skills = await host.projectStore.skill.listUserSkills();
          const dirs = new Set<string>();
          for (const skill of skills) {
            if (isUserSkillAllowedForAgent(host.profile, skill.name)) {
              dirs.add(path.dirname(skill.filePath));
            }
          }
          return [...dirs];
        },
      }),
        createWriteFileTool(projectRoot, fileWriteMutex, getPolicy),
        createEditFileTool(projectRoot, fileWriteMutex, getPolicy),
        createListFilesTool(projectRoot, getPolicy),
        createSearchContentTool(projectRoot, getPolicy),
        createMoveFileTool(projectRoot, fileWriteMutex, getPolicy),
        createCopyFileTool(projectRoot, fileWriteMutex, getPolicy),
        createGenerateImageTool(projectRoot),
      ];
    },
  };
}
