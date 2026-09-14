function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeNode(node: unknown): { value: unknown; changed: boolean } {
  if (Array.isArray(node)) {
    let changed = false;
    const next = node.map((item) => {
      const result = sanitizeNode(item);
      if (result.changed) changed = true;
      return result.value;
    });
    return { value: changed ? next : node, changed };
  }
  if (!isPlainObject(node)) return { value: node, changed: false };
  if (Object.keys(node).length === 0) return { value: { type: "string" }, changed: true };
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    const result = sanitizeNode(value);
    if (result.changed) changed = true;
    next[key] = result.value;
  }
  return { value: changed ? next : node, changed };
}

export function sanitizeToolsPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const tools = payload.tools;
  if (!Array.isArray(tools)) return payload;
  let changed = false;
  const nextTools = tools.map((tool) => {
    if (!isPlainObject(tool)) return tool;
    const fn = tool.function;
    if (!isPlainObject(fn) || !("parameters" in fn)) return tool;
    const parameters = sanitizeNode(fn.parameters);
    if (!parameters.changed) return tool;
    changed = true;
    return { ...tool, function: { ...fn, parameters: parameters.value } };
  });
  if (!changed) return payload;
  return { ...payload, tools: nextTools };
}
