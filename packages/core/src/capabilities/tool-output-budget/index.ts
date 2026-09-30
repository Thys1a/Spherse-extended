import type { Capability } from "../../kernel/capability.js";
import { toolOutputBudgetProjector } from "./projector.js";

export function toolOutputBudgetCapability(): Capability {
  return {
    id: "tool-output-budget",
    contextProjectors: [toolOutputBudgetProjector],
  };
}
