import { Type, type Static } from "@sinclair/typebox";
import type { Manifest, ManifestDiagnostic, ManifestHealth, ManifestMutation, ManifestQuery } from "./types.js";
import { getByDotPath } from "./dot-path.js";

const manifestParamSchema = Type.Object({
  type: Type.Union([Type.Literal("enum"), Type.Literal("field"), Type.Literal("string"), Type.Literal("integer"), Type.Literal("boolean")]),
  values: Type.Optional(Type.Array(Type.String(), { maxItems: 32 })),
  default: Type.Optional(Type.String()),
  desc: Type.Optional(Type.String()),
});

const manifestFieldRuleSchema = Type.Object({
  type: Type.Union([
    Type.Literal("string"),
    Type.Literal("integer"),
    Type.Literal("number"),
    Type.Literal("boolean"),
    Type.Literal("enum"),
  ]),
  values: Type.Optional(Type.Array(Type.String(), { maxItems: 32 })),
  required: Type.Optional(Type.Boolean()),
  default: Type.Optional(Type.Unknown()),
  desc: Type.Optional(Type.String()),
});

const manifestQuerySchema = Type.Object({
  desc: Type.Optional(Type.String()),
  path: Type.String({ minLength: 1 }),
  identity: Type.Optional(Type.String({ minLength: 1 })),
  params: Type.Optional(Type.Record(Type.String(), manifestParamSchema)),
  defaultLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
});

const manifestMutationSchema = Type.Object({
  desc: Type.Optional(Type.String()),
  op: Type.Union([Type.Literal("append"), Type.Literal("update"), Type.Literal("remove"), Type.Literal("set")]),
  path: Type.String({ minLength: 1 }),
  match: Type.Optional(Type.String({ minLength: 1 })),
  fields: Type.Optional(Type.Record(Type.String(), manifestFieldRuleSchema)),
  auto: Type.Optional(Type.Record(Type.String(), Type.Union([Type.Literal("uuid"), Type.Literal("nowIso")]))),
});

export const dataManifestSchema = Type.Object({
  version: Type.Integer({ minimum: 1 }),
  desc: Type.Optional(Type.String()),
  queries: Type.Optional(Type.Record(Type.String(), manifestQuerySchema)),
  mutations: Type.Optional(Type.Record(Type.String(), manifestMutationSchema)),
});

type ManifestShape = Static<typeof dataManifestSchema>;

const MANIFEST_SUPPORTED_VERSION = 2;

// version:1 predates nested object/array fields (R1.1). A v1 manifest that
// declares a nested rule is skipped entry-wise (same leniency as other
// malformed entries); authors must bump to version: 2. See R1.2 diagnostics.
function hasNestedFieldRule(fields: unknown): boolean {
  if (typeof fields !== "object" || fields === null) return false;
  return Object.values(fields).some(
    (r) =>
      typeof r === "object" &&
      r !== null &&
      ((r as { type?: unknown }).type === "object" || (r as { type?: unknown }).type === "array"),
  );
}

export function parseManifest(value: unknown): Manifest | null {
  return parseManifestWithDiagnostics(value).manifest;
}

export function parseManifestWithDiagnostics(value: unknown): {
  manifest: Manifest | null;
  diagnostics: ManifestDiagnostic[];
} {
  const diagnostics: ManifestDiagnostic[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { manifest: null, diagnostics };
  const shape = value as Partial<ManifestShape>;
  if (typeof shape.version !== "number" || shape.version < 1 || shape.version > MANIFEST_SUPPORTED_VERSION) {
    diagnostics.push({
      name: "$manifest",
      reason: `version must be a number between 1 and ${MANIFEST_SUPPORTED_VERSION}`,
    });
    return { manifest: null, diagnostics };
  }
  if (shape.queries !== undefined && (typeof shape.queries !== "object" || shape.queries === null || Array.isArray(shape.queries))) {
    diagnostics.push({ name: "$manifest", reason: "queries must be an object of query entries" });
    return { manifest: null, diagnostics };
  }
  if (shape.mutations !== undefined && (typeof shape.mutations !== "object" || shape.mutations === null || Array.isArray(shape.mutations))) {
    diagnostics.push({ name: "$manifest", reason: "mutations must be an object of mutation entries" });
    return { manifest: null, diagnostics };
  }

  const queries: Record<string, ManifestQuery> = {};
  for (const [name, q] of Object.entries(shape.queries ?? {})) {
    if (!q || typeof q !== "object") {
      diagnostics.push({ name: `queries.${name}`, reason: "entry must be an object" });
      continue;
    }
    if (typeof q.path !== "string" || !q.path) {
      diagnostics.push({ name: `queries.${name}`, reason: "path must be a non-empty string" });
      continue;
    }
    queries[name] = {
      desc: q.desc,
      path: q.path,
      identity: q.identity,
      params: q.params,
      defaultLimit: q.defaultLimit,
    };
  }

  const mutations: Record<string, ManifestMutation> = {};
  for (const [name, m] of Object.entries(shape.mutations ?? {})) {
    if (!m || typeof m !== "object") {
      diagnostics.push({ name: `mutations.${name}`, reason: "entry must be an object" });
      continue;
    }
    if (typeof m.path !== "string" || !m.path) {
      diagnostics.push({ name: `mutations.${name}`, reason: "path must be a non-empty string" });
      continue;
    }
    if (m.op !== "append" && m.op !== "update" && m.op !== "remove" && m.op !== "set") {
      diagnostics.push({
        name: `mutations.${name}`,
        reason: `op must be one of append/update/remove/set (got ${JSON.stringify(m.op)})`,
      });
      continue;
    }
    if (shape.version < 2 && hasNestedFieldRule(m.fields)) {
      diagnostics.push({
        name: `mutations.${name}`,
        reason: "nested object/array fields require version: 2",
      });
      continue;
    }
    const autoShape: unknown = m.auto ?? {};
    if (typeof autoShape !== "object" || autoShape === null || Array.isArray(autoShape)) {
      diagnostics.push({ name: `mutations.${name}`, reason: "auto must be an object of generators" });
      continue;
    }
    let autoOk = true;
    for (const [field, gen] of Object.entries(autoShape)) {
      if (gen !== "uuid" && gen !== "nowIso") {
        diagnostics.push({
          name: `mutations.${name}`,
          reason: `auto.${field} must be one of uuid/nowIso (got ${JSON.stringify(gen)}); entry skipped`,
        });
        autoOk = false;
      }
    }
    if (!autoOk) continue;
    mutations[name] = {
      desc: m.desc,
      op: m.op,
      path: m.path,
      match: m.match,
      fields: m.fields,
      auto: m.auto,
    };
  }

  return {
    manifest: {
      version: shape.version,
      desc: shape.desc,
      queries,
      mutations,
    },
    diagnostics,
  };
}

export function readManifestFromDoc(doc: Record<string, unknown>): Manifest | null {
  const raw = doc.$manifest;
  if (raw === undefined) return null;
  return parseManifest(raw);
}

export function readManifestWithDiagnosticsFromDoc(doc: Record<string, unknown>): {
  manifest: Manifest | null;
  diagnostics: ManifestDiagnostic[];
} {
  const raw = doc.$manifest;
  if (raw === undefined) return { manifest: null, diagnostics: [] };
  return parseManifestWithDiagnostics(raw);
}

export function checkManifestHealth(
  doc: Record<string, unknown>,
  manifest: Manifest | null,
  diagnostics?: ManifestDiagnostic[],
): ManifestHealth {
  if (!manifest) {
    const rawPresent = doc.$manifest !== undefined;
    return {
      status: rawPresent ? "invalid" : "absent",
      staleQueries: [],
      staleMutations: [],
      ...(diagnostics !== undefined ? { diagnostics } : {}),
    };
  }
  const staleQueries: string[] = [];
  const staleMutations: string[] = [];
  for (const [name, q] of Object.entries(manifest.queries)) {
    if (getByDotPath(doc, q.path).missing) staleQueries.push(name);
  }
  for (const [name, m] of Object.entries(manifest.mutations)) {
    if (getByDotPath(doc, m.path).missing) staleMutations.push(name);
  }
  return {
    status: staleQueries.length > 0 || staleMutations.length > 0 ? "stale" : "healthy",
    staleQueries,
    staleMutations,
    ...(diagnostics !== undefined ? { diagnostics } : {}),
  };
}
