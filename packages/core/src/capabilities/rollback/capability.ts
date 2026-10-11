import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Capability } from "../../kernel/capability.js";
import type { DataStore } from "../data/types.js";
import type { CardStore } from "../card/types.js";
import type { AccessPolicyProvider } from "../../access/access-policy.js";
import { createDataStore } from "../data/data-store.js";
import { createCardStore } from "../card/card-store.js";
import { createRollbackTurnTool } from "./tools.js";
import { llmPolicyOf } from "../shared/llm-policy.js";

export interface RollbackCapabilityOptions {
  dataStore?: DataStore;
  cardStore?: CardStore;
}

export function rollbackCapability(shared?: RollbackCapabilityOptions): Capability {
  let ownData: DataStore | null = null;
  let ownCard: CardStore | null = null;
  return {
    id: "rollback",
    tools: (host) => {
      const dataStore =
        shared?.dataStore ??
        (ownData ??= createDataStore({
          projectRoot: host.projectRoot,
          fileWriteMutex: host.fileWriteMutex,
          logger: host.logger,
        }));
      const cardStore =
        shared?.cardStore ??
        (ownCard ??= createCardStore({
          projectRoot: host.projectRoot,
          fileWriteMutex: host.fileWriteMutex,
          logger: host.logger,
        }));
      const getPolicy: AccessPolicyProvider = llmPolicyOf(host);
      return [
        createRollbackTurnTool({
          dataStore,
          cardStore,
          stores: host.stores,
          sessionId: host.sessionId,
          getPolicy,
        }),
      ] satisfies AgentTool[];
    },
  };
}

