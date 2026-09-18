import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Capability } from "../../kernel/capability.js";
import type { CardStore } from "./types.js";
import { createCardStore } from "./card-store.js";
import { createEditCardTool, createReadCardTool, createSearchCardTool } from "./tools.js";
import { llmPolicyOf } from "../shared/llm-policy.js";

export function cardCapability(shared?: CardStore): Capability {
  let own: CardStore | null = null;
  return {
    id: "card",
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
