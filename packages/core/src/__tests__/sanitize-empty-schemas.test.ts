import { describe, it, expect } from "vitest";
import { sanitizeToolsPayload } from "../model-providers/sanitize-empty-schemas.js";

function toolWithParameters(parameters: unknown): Record<string, unknown> {
  return {
    tools: [
      {
        type: "function",
        function: { name: "t", description: "t", parameters, strict: true },
      },
    ],
  };
}

function parametersOf(payload: Record<string, unknown>): unknown {
  const tools = payload.tools as Array<{ function: { parameters: unknown } }>;
  return tools[0].function.parameters;
}

describe("sanitizeToolsPayload", () => {
  it("replaces an empty property schema with a string type", () => {
    const payload = toolWithParameters({
      type: "object",
      properties: { params: {} },
      required: ["params"],
    });

    expect(parametersOf(sanitizeToolsPayload(payload))).toEqual({
      type: "object",
      properties: { params: { type: "string" } },
      required: ["params"],
    });
  });

  it("replaces an empty additionalProperties schema (Record shape)", () => {
    const payload = toolWithParameters({
      type: "object",
      properties: {
        args: { type: "object", additionalProperties: {} },
      },
    });

    expect(parametersOf(sanitizeToolsPayload(payload))).toEqual({
      type: "object",
      properties: {
        args: { type: "object", additionalProperties: { type: "string" } },
      },
    });
  });

  it("recurses into arrays and nested objects", () => {
    const payload = toolWithParameters({
      type: "object",
      properties: {
        choice: { anyOf: [{ type: "string" }, {}] },
        nested: { type: "object", properties: { leaf: {} } },
      },
    });

    const parameters = parametersOf(sanitizeToolsPayload(payload)) as {
      properties: { choice: { anyOf: unknown[] }; nested: { properties: { leaf: unknown } } };
    };

    expect(parameters.properties.choice.anyOf[1]).toEqual({ type: "string" });
    expect(parameters.properties.nested.properties.leaf).toEqual({ type: "string" });
  });

  it("returns the identical payload when nothing needs cleaning", () => {
    const payload = toolWithParameters({
      type: "object",
      properties: { q: { type: "string" } },
    });

    expect(sanitizeToolsPayload(payload)).toBe(payload);
  });

  it("returns the identical payload without a tools array", () => {
    const withoutTools = { messages: [] };
    expect(sanitizeToolsPayload(withoutTools)).toBe(withoutTools);

    const nonArrayTools = { tools: "nope" };
    expect(sanitizeToolsPayload(nonArrayTools)).toBe(nonArrayTools);
  });

  it("leaves tools without function parameters untouched", () => {
    const payload = { tools: [{ type: "custom", custom: { name: "g" } }] };
    expect(sanitizeToolsPayload(payload)).toBe(payload);
  });

  it("does not mutate the input and leaves messages alone", () => {
    const payload: Record<string, unknown> = {
      messages: [{ role: "user" }],
      ...toolWithParameters({ type: "object", properties: { p: {} } }),
    };

    const result = sanitizeToolsPayload(payload);

    expect(parametersOf(payload)).toEqual({
      type: "object",
      properties: { p: {} },
    });
    expect(result.messages).toBe(payload.messages);
  });
});
