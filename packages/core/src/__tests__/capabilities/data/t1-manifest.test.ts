import { describe, expect, it } from "vitest";
import { checkManifestHealth, parseManifest, parseManifestWithDiagnostics, readManifestFromDoc } from "../../../capabilities/data/manifest.js";
import { getByDotPath, splitDotPath, stripReservedKeys } from "../../../capabilities/data/dot-path.js";
import { validateMutationArgs, validateQueryParams } from "../../../capabilities/data/validate.js";
import { DataValidationError } from "../../../capabilities/data/types.js";

describe("parseManifest", () => {
  it("parses a full manifest", () => {
    const m = parseManifest({
      version: 1,
      desc: "todo board",
      queries: {
        listTodos: { path: "todos", identity: "id", defaultLimit: 20, params: { status: { type: "enum", values: ["pending", "done"] } } },
      },
      mutations: {
        addTodo: { op: "append", path: "todos", fields: { title: { type: "string", required: true } }, auto: { id: "uuid", createdAt: "nowIso" } },
        removeTodo: { op: "remove", path: "todos", match: "id" },
      },
    });
    expect(m).not.toBeNull();
    expect(m!.queries.listTodos.identity).toBe("id");
    expect(m!.mutations.addTodo.op).toBe("append");
  });

  it("returns null for non-object or wrong version", () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest([])).toBeNull();
    expect(parseManifest("x")).toBeNull();
    expect(parseManifest({ version: 3, queries: {} })).toBeNull();
    expect(parseManifest({ version: 0, queries: {} })).toBeNull();
    expect(parseManifest({ queries: {} })).toBeNull();
  });

  it("parses version 2 manifests", () => {
    const m = parseManifest({ version: 2, queries: {}, mutations: {} });
    expect(m).not.toBeNull();
    expect(m!.version).toBe(2);
  });

  it("keeps nested field rules on version 2, drops them on version 1", () => {
    const nested = {
      op: "append",
      path: "party",
      fields: {
        name: { type: "string", required: true },
        stats: {
          type: "object",
          required: true,
          properties: { hp: { type: "integer", required: true } },
        },
        tags: { type: "array", items: { type: "string" } },
      },
    };
    const v2 = parseManifest({ version: 2, mutations: { addMember: nested } });
    expect(Object.keys(v2!.mutations)).toEqual(["addMember"]);
    expect(v2!.mutations.addMember.fields!.stats.type).toBe("object");
    const v1 = parseManifest({ version: 1, mutations: { addMember: nested } });
    expect(Object.keys(v1!.mutations)).toEqual([]);
    const v1scalar = parseManifest({
      version: 1,
      mutations: { addTodo: { op: "append", path: "todos", fields: { title: { type: "string" } } } },
    });
    expect(Object.keys(v1scalar!.mutations)).toEqual(["addTodo"]);
  });

  it("parseManifestWithDiagnostics reports skipped entries with reasons", () => {
    const { manifest, diagnostics } = parseManifestWithDiagnostics({
      version: 2,
      queries: {
        good: { path: "todos" },
        noPath: { identity: "id" },
      },
      mutations: {
        addTodo: { op: "append", path: "todos", fields: { title: { type: "string" } } },
        badOp: { op: "frobnicate", path: "todos" },
        noPath: { op: "append" },
        badAuto: {
          op: "append",
          path: "todos",
          fields: { title: { type: "string" } },
          auto: { id: "sequence" },
        },
      },
    });
    expect(Object.keys(manifest!.queries)).toEqual(["good"]);
    expect(Object.keys(manifest!.mutations)).toEqual(["addTodo", "badAuto"]);
    expect(diagnostics).toContainEqual({
      name: "queries.noPath",
      reason: "path must be a non-empty string",
    });
    expect(diagnostics).toContainEqual({
      name: "mutations.badOp",
      reason: 'op must be one of append/update/remove/set (got "frobnicate")',
    });
    expect(diagnostics).toContainEqual({
      name: "mutations.noPath",
      reason: "path must be a non-empty string",
    });
    expect(diagnostics).toContainEqual({
      name: "mutations.badAuto",
      reason: 'auto.id must be one of uuid/nowIso (got "sequence")',
    });
  });

  it("parseManifestWithDiagnostics reports unparsable manifests", () => {
    expect(parseManifestWithDiagnostics({ version: 3 }).diagnostics).toContainEqual({
      name: "$manifest",
      reason: "version must be an integer between 1 and 2",
    });
    expect(parseManifestWithDiagnostics(null).manifest).toBeNull();
  });

  it("tolerates missing queries/mutations", () => {
    const m = parseManifest({ version: 1 });
    expect(m).not.toBeNull();
    expect(m!.queries).toEqual({});
    expect(m!.mutations).toEqual({});
  });

  it("drops invalid entries instead of failing whole manifest", () => {
    const m = parseManifest({
      version: 1,
      queries: { good: { path: "todos" }, bad: { desc: "no path" } },
      mutations: { badop: { op: "delete", path: "todos" }, good: { op: "set", path: "stats" } },
    });
    expect(Object.keys(m!.queries)).toEqual(["good"]);
    expect(Object.keys(m!.mutations)).toEqual(["good"]);
  });

  it("reads manifest from doc", () => {
    expect(readManifestFromDoc({ todos: [] })).toBeNull();
    const doc = { $manifest: { version: 1 }, todos: [] };
    expect(readManifestFromDoc(doc)!.version).toBe(1);
  });
});

describe("checkManifestHealth", () => {
  const manifest = parseManifest({
    version: 1,
    queries: { listTodos: { path: "todos" }, listGone: { path: "gone" } },
    mutations: { addTodo: { op: "append", path: "todos" }, resetGone: { op: "set", path: "gone" } },
  })!;

  it("healthy when all paths resolve", () => {
    const h = checkManifestHealth({ todos: [], gone: 1 }, manifest);
    expect(h.status).toBe("healthy");
  });

  it("stale lists entries whose path is missing", () => {
    const h = checkManifestHealth({ todos: [] }, manifest);
    expect(h.status).toBe("stale");
    expect(h.staleQueries).toEqual(["listGone"]);
    expect(h.staleMutations).toEqual(["resetGone"]);
  });

  it("absent when no $manifest key, invalid when unparsable", () => {
    expect(checkManifestHealth({ todos: [] }, null).status).toBe("absent");
    expect(checkManifestHealth({ $manifest: "garbage" }, null).status).toBe("invalid");
  });
});

describe("dot-path", () => {
  const doc = { todos: [{ id: "a" }], stats: { hp: 80, mp: 50 }, $manifest: { version: 1 } };

  it("resolves nested paths", () => {
    expect(getByDotPath(doc, "stats.hp")).toEqual({ value: 80, missing: false });
    expect(getByDotPath(doc, "todos").missing).toBe(false);
  });

  it("missing for unknown / type-crossing paths", () => {
    expect(getByDotPath(doc, "nope").missing).toBe(true);
    expect(getByDotPath(doc, "stats.hp.deep").missing).toBe(true);
    expect(getByDotPath(doc, "todos.0").missing).toBe(true);
  });

  it("rejects $-prefixed segments", () => {
    expect(getByDotPath(doc, "$manifest").missing).toBe(true);
    expect(splitDotPath("a.$b")).toBeNull();
  });

  it("root path strips $ keys", () => {
    const r = getByDotPath(doc, ".");
    expect(r.missing).toBe(false);
    expect(Object.keys(r.value as object)).toEqual(["todos", "stats"]);
  });

  it("stripReservedKeys removes $ keys", () => {
    expect(stripReservedKeys({ $a: 1, b: 2, $$c: 3 })).toEqual({ b: 2 });
  });

  it("empty path returns null segments", () => {
    expect(splitDotPath(".")).toBeNull();
    expect(splitDotPath("a..b")).toEqual(["a", "b"]);
  });
});

describe("validateMutationArgs", () => {
  const base = {
    op: "append" as const,
    path: "todos",
    fields: {
      title: { type: "string" as const, required: true },
      priority: { type: "enum" as const, values: ["low", "high"], default: "low" },
      count: { type: "integer" as const },
    },
    auto: { id: "uuid" as const },
  };

  it("validates, applies defaults, rejects auto fields", () => {
    const { value } = validateMutationArgs(base, { title: "x", count: 2 });
    expect(value).toEqual({ title: "x", priority: "low", count: 2 });
    expect(() => validateMutationArgs(base, { title: "x", id: "self-made" })).toThrow(DataValidationError);
  });

  it("reports required missing / type errors / unknown fields", () => {
    expect(() => validateMutationArgs(base, {})).toThrow(/required field missing/);
    expect(() => validateMutationArgs(base, { title: 1 })).toThrow(/expected string/);
    expect(() => validateMutationArgs(base, { title: "x", count: 1.5 })).toThrow(/expected integer/);
    expect(() => validateMutationArgs(base, { title: "x", bogus: 1 })).toThrow(/unknown field/);
    expect(() => validateMutationArgs(base, { title: "x", priority: "mid" })).toThrow(/must be one of/);
  });

  it("validates match identity implicitly required", () => {
    const m = { ...base, op: "update" as const, match: "id", fields: { status: { type: "enum" as const, values: ["done"] } } };
    expect(() => validateMutationArgs(m, { status: "done" })).toThrow(/identity field "id" is required/);
    expect(() => validateMutationArgs(m, { id: true, status: "done" })).toThrow(/string or number/);
    expect(validateMutationArgs(m, { id: "a1", status: "done" }).value).toEqual({ status: "done", id: "a1" });
    const redeclared = { ...m, fields: { id: { type: "string" as const }, status: { type: "enum" as const, values: ["done"] } } };
    expect(() => validateMutationArgs(redeclared, { id: "a1", status: "done" })).toThrow(/must not be redeclared/);
  });
});

describe("validateMutationArgs nested (R1.1)", () => {
  const member = {
    op: "append" as const,
    path: "party",
    fields: {
      name: { type: "string" as const, required: true },
      stats: {
        type: "object" as const,
        required: true,
        properties: {
          hp: { type: "integer" as const, required: true },
          level: { type: "integer" as const, default: 1 },
        },
      },
      tags: { type: "array" as const, items: { type: "string" as const } },
    },
  };

  it("accepts valid nested values and fills nested defaults", () => {
    const input = { name: "ash", stats: { hp: 80 }, tags: ["brave"] };
    const { value } = validateMutationArgs(member, input);
    expect(value).toEqual({ name: "ash", stats: { hp: 80, level: 1 }, tags: ["brave"] });
    // caller input must not be mutated by default filling
    expect(input).toEqual({ name: "ash", stats: { hp: 80 }, tags: ["brave"] });
  });

  it("reports nested required missing / type errors with dotted paths", () => {
    expect(() => validateMutationArgs(member, { name: "x", stats: {} })).toThrow(
      /stats\.hp: required field missing/,
    );
    expect(() => validateMutationArgs(member, { name: "x", stats: { hp: "high" } })).toThrow(
      /stats\.hp: expected integer/,
    );
    expect(() => validateMutationArgs(member, { name: "x", stats: [1] })).toThrow(
      /stats: expected object/,
    );
    expect(() => validateMutationArgs(member, { name: "x", stats: { hp: 1 }, tags: "nope" })).toThrow(
      /tags: expected array/,
    );
    expect(() =>
      validateMutationArgs(member, { name: "x", stats: { hp: 1 }, tags: ["ok", 7] }),
    ).toThrow(/tags\[1\]: expected string/);
  });

  it("rejects unknown nested fields", () => {
    expect(() =>
      validateMutationArgs(member, { name: "x", stats: { hp: 1, mp: 5 } }),
    ).toThrow(/stats\.mp: unknown field/);
  });

  it("validates arrays of objects element-wise", () => {
    const m = {
      op: "append" as const,
      path: "party",
      fields: {
        members: {
          type: "array" as const,
          required: true,
          items: {
            type: "object" as const,
            properties: { hp: { type: "integer" as const, required: true } },
          },
        },
      },
    };
    const { value } = validateMutationArgs(m, { members: [{ hp: 10 }, { hp: 20 }] });
    expect(value).toEqual({ members: [{ hp: 10 }, { hp: 20 }] });
    expect(() => validateMutationArgs(m, { members: [{ hp: 10 }, {}] })).toThrow(
      /members\[1\]\.hp: required field missing/,
    );
    expect(() => validateMutationArgs(m, {})).toThrow(/members: required field missing/);
  });

  it("rejects nesting beyond L1", () => {
    const deep = {
      op: "append" as const,
      path: "p",
      fields: {
        a: {
          type: "object" as const,
          properties: {
            b: {
              type: "object" as const,
              properties: {
                c: { type: "object" as const, properties: { d: { type: "integer" as const } } },
              },
            },
          },
        },
      },
    };
    expect(() => validateMutationArgs(deep, { a: { b: { c: { d: 1 } } } })).toThrow(/exceeds L1/);
    const deepArr = {
      op: "append" as const,
      path: "p",
      fields: {
        arr: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              nested: {
                type: "object" as const,
                properties: { x: { type: "integer" as const } },
              },
            },
          },
        },
      },
    };
    expect(() => validateMutationArgs(deepArr, { arr: [{ nested: { x: 1 } }] })).toThrow(
      /exceeds L1/,
    );
  });

  it("allows one nested object level with scalar leaves", () => {
    const m = {
      op: "append" as const,
      path: "p",
      fields: {
        a: {
          type: "object" as const,
          properties: {
            b: { type: "object" as const, properties: { x: { type: "integer" as const } } },
          },
        },
      },
    };
    expect(validateMutationArgs(m, { a: { b: { x: 1 } } }).value).toEqual({ a: { b: { x: 1 } } });
  });

  it("rejects malformed nested rules instead of silently passing", () => {
    const badProps = {
      op: "append" as const,
      path: "p",
      fields: { a: { type: "object" as const, properties: "nope" as unknown as Record<string, never> } },
    };
    expect(() => validateMutationArgs(badProps, { a: {} })).toThrow(/invalid properties/);
    const badItems = {
      op: "append" as const,
      path: "p",
      fields: {
        arr: { type: "array" as const, items: { type: "garbage" as unknown as "string" } },
      },
    };
    expect(() => validateMutationArgs(badItems, { arr: ["x"] })).toThrow(/unsupported field type/);
    const badSub = {
      op: "append" as const,
      path: "p",
      fields: {
        a: { type: "object" as const, properties: { x: "oops" as unknown as { type: "string" } } },
      },
    };
    expect(() => validateMutationArgs(badSub, { a: { x: 1 } })).toThrow(/invalid field rule/);
  });

  it("rejects uncloneable values as validation errors", () => {
    const fn = () => {};
    expect(() => validateMutationArgs(member, { name: "x", stats: { hp: 1, cb: fn } })).toThrow(
      DataValidationError,
    );
  });

  it("unshaped object/array defaults are strict", () => {
    const bareObj = {
      op: "append" as const,
      path: "p",
      fields: { a: { type: "object" as const } },
    };
    expect(validateMutationArgs(bareObj, { a: {} }).value).toEqual({ a: {} });
    expect(() => validateMutationArgs(bareObj, { a: { x: 1 } })).toThrow(/unknown field/);
    const bareArr = {
      op: "append" as const,
      path: "p",
      fields: { arr: { type: "array" as const } },
    };
    expect(validateMutationArgs(bareArr, { arr: [] }).value).toEqual({ arr: [] });
    expect(() => validateMutationArgs(bareArr, { arr: [1] })).toThrow(/items type not declared/);
  });

  it("update skips default filling so partial nested writes keep stored values", () => {
    const upd = {
      op: "update" as const,
      path: "party",
      match: "name",
      fields: {
        stats: {
          type: "object" as const,
          properties: {
            hp: { type: "integer" as const, required: true },
            level: { type: "integer" as const, default: 1 },
          },
        },
        nick: { type: "string" as const, default: "none" },
      },
    };
    const { value } = validateMutationArgs(upd, { name: "ash", stats: { hp: 90 } });
    expect(value).toEqual({ name: "ash", stats: { hp: 90 } });
  });

  it("nested field names may repeat top-level auto/match names", () => {
    const m = {
      op: "append" as const,
      path: "party",
      match: undefined as unknown as string | undefined,
      fields: {
        profile: {
          type: "object" as const,
          properties: { id: { type: "string" as const, required: true } },
        },
      },
      auto: { id: "uuid" as const },
    };
    const { value } = validateMutationArgs(m, { profile: { id: "inner" } });
    expect(value).toEqual({ profile: { id: "inner" } });
  });
});

describe("validateQueryParams", () => {
  const query = {
    path: "todos",
    identity: "id",
    params: {
      status: { type: "enum" as const, values: ["pending", "done"] },
      sort: { type: "field" as const },
      n: { type: "integer" as const },
    },
  };

  it("accepts declared params and identity value", () => {
    const r = validateQueryParams(query, { status: "done", id: "a1", n: 3 });
    expect(r.values).toEqual({ status: "done", n: 3 });
    expect(r.identityValue).toBe("a1");
  });

  it("rejects unknown params and bad enum", () => {
    expect(() => validateQueryParams(query, { bogus: 1 })).toThrow(/unknown param/);
    expect(() => validateQueryParams(query, { status: "nope" })).toThrow(/must be one of/);
    expect(() => validateQueryParams(query, { id: true })).toThrow(/identity filter/);
  });
});
