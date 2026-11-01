import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { SkillDefinition } from "../types.js";
import type { SkillStore } from "../store/skill.js";
import { skillFileDisplayPath } from "../store/skill.js";
import { truncateText } from "./output-limits.js";

const LoadSkillParams = Type.Object({
  skill_name: Type.String({ description: "Name of the skill to load" }),
});

export function createLoadSkillTool(
  projectRoot: string,
  skillStore: SkillStore,
  agentSkillStore?: SkillStore,
  isAllowed?: (skill: SkillDefinition) => boolean,
): AgentTool<typeof LoadSkillParams> {
  return {
    name: "load_skill",
    label: "Load Skill",
    description:
      "Load a skill's full instructions. Use this when you want to activate a skill from the available skills list.",
    parameters: LoadSkillParams,
    async execute(_toolCallId, params, _signal) {
      const agentSkill = await agentSkillStore?.get(params.skill_name);
      if (agentSkill) {
        return renderSkill(projectRoot, agentSkill);
      }
      const skill = await skillStore.get(params.skill_name);
      if (!skill || isAllowed?.(skill) === false) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: skill "${params.skill_name}" not found.`,
            },
          ],
          details: undefined,
        };
      }
      return renderSkill(projectRoot, skill);
    },
  };
}

function renderSkill(projectRoot: string, skill: SkillDefinition) {
  let text = `<skill-content name="${skill.name}">\n${skill.instructions}`;
  if (skill.files.length > 0) {
    const fileList = skill.files
      .map((f) => `- ${skillFileDisplayPath(projectRoot, skill, f)}`)
      .join("\n");
    text += `\n\n## Skill Files\n\nThis skill has companion files you can read with the read_file tool:\n${fileList}`;
  }
  text += `\n</skill-content>`;

  const { text: capped, truncated } = truncateText(text);
  return {
    content: [
      {
        type: "text" as const,
        text: capped,
      },
    ],
    details: { name: skill.name, truncated },
  };
}
