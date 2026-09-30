import type { Capability } from "../../kernel/capability.js";
import { toolOutputBudgetProjector } from "./projector.js";
import { toolOutputPruningProjector } from "./pruning-projector.js";

export function toolOutputBudgetCapability(): Capability {
  return {
    id: "tool-output-budget",
    contextProjectors: [toolOutputBudgetProjector, toolOutputPruningProjector],
  };
}
