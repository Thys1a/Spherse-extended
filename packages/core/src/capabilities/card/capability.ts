import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Capability } from "../../kernel/capability.js";
import type { TurnHooksFactory } from "../../kernel/turn-hooks.js";
import type { ProjectStore } from "../../store/project.js";
import type { Logger } from "../../logger.js";
import type { CardStore } from "./types.js";
import { createCardStore } from "./card-store.js";
import { createEditCardTool, createReadCardTool, createSearchCardTool } from "./tools.js";
import { worldbookProjector } from "./worldbook.js";
import { readAgentWorldbook, renderWorldbook, selectWorldbookEntries } from "./worldbook.js";
import { MCP_CONTEXT_START } from "../mcp/block.js";
import { llmPolicyOf } from "../shared/llm-policy.js";

export function cardCapability(shared?: CardStore): Capability {
  let own: CardStore | null = null;
  return {
    id: "card",
    contextProjectors: [worldbookProjector],
    tools: (host) => {
      const store =
        shared ??
        (own ??= createCardStore({
          projectRoot: host.projectRoot,
          fileWriteMutex: host.fileWriteMutex,
          logger: host.logger,
        }));
      const getPolicy = llmPolicyOf(host);
      return [
        createReadCardTool(store, getPolicy),
        createSearchCardTool(store, getPolicy),
        createEditCardTool(store, getPolicy, host.sessionId),
      ] satisfies AgentTool[];
    },
  };
}

const WORLDBOOK_BEFORE_START = "<!-- spherse:worldbook:before-mcp:start -->";
const WORLDBOOK_BEFORE_END = "<!-- spherse:worldbook:before-mcp:end -->";
const WORLDBOOK_AFTER_START = "<!-- spherse:worldbook:after-mcp:start -->";
const WORLDBOOK_AFTER_END = "<!-- spherse:worldbook:after-mcp:end -->";

const WORLDBOOK_BEFORE_RE =
  /\n*<!-- spherse:worldbook:before-mcp:start -->[\s\S]*?<!-- spherse:worldbook:before-mcp:end -->/g;
const WORLDBOOK_AFTER_RE =
  /\n*<!-- spherse:worldbook:after-mcp:start -->[\s\S]*?<!-- spherse:worldbook:after-mcp:end -->/g;

export interface WorldbookSystemCapabilityDeps {
  readonly projectStore: ProjectStore;
  readonly logger?: Logger;
}

export function worldbookSystemCapability(deps: WorldbookSystemCapabilityDeps): Capability {
  const turnHooks: TurnHooksFactory = (agentId) => {
    let warnedDepthFallback = false;
    return {
      async beforeTurn(agent, pendingUserText?) {
        const profile = deps.projectStore.getAgent(agentId)?.getProfile();
        if (!profile) return;
        const entries = readAgentWorldbook(deps.projectStore.getRootPath(), profile.slug);
        if (!warnedDepthFallback) {
          const dangling = entries.find(
            (e) =>
              e.enabled &&
              e.position === 2 &&
              (typeof e.depth !== "number" || !Number.isInteger(e.depth) || e.depth < 1),
          );
          if (dangling) {
            warnedDepthFallback = true;
            deps.logger?.warn(
              { agentId, entryId: dangling.id },
              "worldbook entry uses position 2 without a valid depth, falling back to 3",
            );
          }
        }
        const scanMessages =
          pendingUserText !== undefined && pendingUserText !== ""
            ? [...agent.state.messages, { role: "user", content: pendingUserText } as never]
            : agent.state.messages;
        const groups = selectWorldbookEntries(entries, scanMessages);
        let prompt = agent.state.systemPrompt
          .replace(WORLDBOOK_BEFORE_RE, "")
          .replace(WORLDBOOK_AFTER_RE, "");
        const before = groups.find((g) => g.position === 0);
        if (before) {
          const block =
            `${WORLDBOOK_BEFORE_START}\n${renderWorldbook(before.entries)}\n${WORLDBOOK_BEFORE_END}`;
          const mcpIdx = prompt.indexOf(MCP_CONTEXT_START);
          prompt =
            mcpIdx < 0 ? `${prompt}\n\n${block}` : `${prompt.slice(0, mcpIdx)}${block}\n\n${prompt.slice(mcpIdx)}`;
        }
        const after = groups.find((g) => g.position === 1);
        if (after) {
          prompt += `\n\n${WORLDBOOK_AFTER_START}\n${renderWorldbook(after.entries)}\n${WORLDBOOK_AFTER_END}`;
        }
        agent.state.systemPrompt = prompt;
      },
    };
  };
  return { id: "card-worldbook-system", turnHooks };
}
