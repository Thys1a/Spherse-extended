import type { Capability } from "../kernel/capability.js";
import type { DataStore } from "./data/index.js";
import { fsCapability } from "./fs/index.js";
import { skillCapability } from "./skill/index.js";
import { changelogCapability } from "./changelog/index.js";
import { renderCapability } from "./render/index.js";
import { agentMgmtCapability } from "./agent-mgmt/index.js";
import { interactionCapability } from "./interaction/index.js";
import { projectConfigCapability } from "./project-config/index.js";
import { dataCapability } from "./data/index.js";
import { rollbackCapability } from "./rollback/index.js";
import type { CardStore } from "./card/index.js";
import { cardCapability } from "./card/index.js";

export interface BuiltinToolCapabilitiesOptions {
  dataStore?: DataStore;
  cardStore?: CardStore;
}

export function builtinToolCapabilities(opts?: BuiltinToolCapabilitiesOptions): Capability[] {
  return [
    fsCapability(),
    skillCapability(),
    changelogCapability(),
    renderCapability(),
    agentMgmtCapability(),
    interactionCapability(),
    projectConfigCapability(),
    dataCapability(opts?.dataStore),
    cardCapability(opts?.cardStore),
    rollbackCapability({ dataStore: opts?.dataStore, cardStore: opts?.cardStore }),
  ];
}
