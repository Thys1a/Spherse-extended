import type { ManifestFieldRule, ManifestMutation, ManifestParam, ManifestQuery } from "./types.js";
import { DataValidationError } from "./types.js";

type FieldType = ManifestFieldRule["type"];

function checkValueType(value: unknown, type: FieldType, values?: string[]): string | null {
  switch (type) {
    case "string":
      return typeof value === "string" ? null : "expected string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value) ? null : "expected integer";
    case "number":
      return typeof value === "number" ? null : "expected number";
    case "boolean":
      return typeof value === "boolean" ? null : "expected boolean";
    case "enum":
      if (typeof value !== "string") return "expected string (enum)";
      if (values && !values.includes(value)) return `value must be one of: ${values.join(", ")}`;
      return null;
    case "object":
    case "array":
      // Nested shapes are validated by checkNestedValue, not here.
      return "expected object or array rule handled by nested validation";
    default:
      return `unsupported field type ${JSON.stringify(type)}`;
  }
}

// Validates a nested object/array value against its rule, filling declared
// defaults in place. `value` must be a fresh clone: defaults are written into
// it so the caller never mutates user input. Returns false when errors were
// recorded (paths are dotted, e.g. "party.members[0].hp"; these keys are
// diagnostic only and never pass through dot-path resolution).
const MAX_NESTED_LEVEL = 1;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkNestedValue(
  rule: ManifestFieldRule,
  value: unknown,
  path: string,
  errors: Record<string, string>,
  depth: number,
  fillDefaults: boolean,
): boolean {
  if (depth > MAX_NESTED_LEVEL) {
    errors[path] = "nesting exceeds L1 limit (max 1 level of nested object/array)";
    return false;
  }
  if (rule.type === "object") {
    if (!isPlainRecord(value)) {
      errors[path] = "expected object";
      return false;
    }
    const obj = value;
    const rawProps: unknown = rule.properties ?? {};
    if (!isPlainRecord(rawProps)) {
      errors[path] = "invalid properties (must be an object of field rules)";
      return false;
    }
    const props = rawProps as Record<string, ManifestFieldRule>;
    let ok = true;
    for (const [key, sub] of Object.entries(props)) {
      const subPath = `${path}.${key}`;
      if (!isPlainRecord(sub) || typeof (sub as { type?: unknown }).type !== "string") {
        errors[subPath] = "invalid field rule";
        ok = false;
        continue;
      }
      const v = obj[key];
      if (v === undefined) {
        if (fillDefaults && sub.default !== undefined) {
          obj[key] = sub.default;
          continue;
        }
        if (sub.required) {
          errors[subPath] = "required field missing";
          ok = false;
        }
        continue;
      }
      if (sub.type === "object" || sub.type === "array") {
        if (!checkNestedValue(sub, v, subPath, errors, depth + 1, fillDefaults)) ok = false;
      } else {
        const err = checkValueType(v, sub.type, sub.values);
        if (err) {
          errors[subPath] = err;
          ok = false;
        }
      }
    }
    for (const key of Object.keys(obj)) {
      if (!(key in props)) {
        errors[`${path}.${key}`] =
          `unknown field "${key}" (allowed: ${Object.keys(props).join(", ") || "none"})`;
        ok = false;
      }
    }
    return ok;
  }
  if (rule.type === "array") {
    if (!Array.isArray(value)) {
      errors[path] = "expected array";
      return false;
    }
    const items: unknown = rule.items;
    if (items === undefined) {
      if (value.length > 0) {
        errors[path] = "array items type not declared";
        return false;
      }
      return true;
    }
    if (!isPlainRecord(items) || typeof (items as { type?: unknown }).type !== "string") {
      errors[path] = "invalid items (must be a field rule)";
      return false;
    }
    const itemRule = items as unknown as ManifestFieldRule;
    let ok = true;
    value.forEach((item, i) => {
      const itemPath = `${path}[${i}]`;
      if (itemRule.type === "object" || itemRule.type === "array") {
        if (!checkNestedValue(itemRule, item, itemPath, errors, depth + 1, fillDefaults)) ok = false;
      } else {
        const err = checkValueType(item, itemRule.type, itemRule.values);
        if (err) {
          errors[itemPath] = err;
          ok = false;
        }
      }
    });
    return ok;
  }
  return true;
}

export interface ValidatedFields {
  value: Record<string, unknown>;
}

export function validateMutationArgs(
  mutation: ManifestMutation,
  args: Record<string, unknown>,
): ValidatedFields {
  const errors: Record<string, string> = {};
  const value: Record<string, unknown> = {};

  const fields = mutation.fields ?? {};
  const auto = mutation.auto ?? {};
  const fillDefaults = mutation.op !== "update";

  for (const [name, rule] of Object.entries(fields)) {
    if (name in auto) {
      errors[name] = "field is declared both in fields and auto";
      continue;
    }
    if (args[name] === undefined) {
      if (fillDefaults && rule.default !== undefined) {
        value[name] = rule.default;
        continue;
      }
      if (rule.required) {
        errors[name] = "required field missing";
      }
      continue;
    }
    if (rule.type === "object" || rule.type === "array") {
      // Clone first: nested defaults are filled in place and caller input
      // must never be mutated.
      let cloned: unknown;
      try {
        cloned = structuredClone(args[name]);
      } catch {
        errors[name] = "value is not cloneable/serializable";
        continue;
      }
      if (checkNestedValue(rule, cloned, name, errors, 0, fillDefaults)) {
        value[name] = cloned;
      }
      continue;
    }
    const err = checkValueType(args[name], rule.type, rule.values);
    if (err) errors[name] = err;
    else value[name] = args[name];
  }

  for (const name of Object.keys(auto)) {
    if (name === mutation.match) continue;
    if (args[name] !== undefined) {
      errors[name] = "auto field must not be provided (it is generated)";
    }
  }

  if (mutation.match) {
    const matchValue = args[mutation.match];
    if (matchValue === undefined || matchValue === null || matchValue === "") {
      errors[mutation.match] = `identity field "${mutation.match}" is required for ${mutation.op}`;
    } else if (typeof matchValue !== "string" && typeof matchValue !== "number") {
      errors[mutation.match] = "identity field must be string or number";
    } else {
      value[mutation.match] = matchValue;
    }
    if (fields[mutation.match]) {
      errors[mutation.match] = "identity field must not be redeclared in fields";
    }
  }

  const known = new Set<string>([...Object.keys(fields), ...Object.keys(auto)]);
  if (mutation.match) known.add(mutation.match);
  for (const name of Object.keys(args)) {
    if (!known.has(name)) {
      errors[name] = `unknown field "${name}" (allowed: ${[...known].join(", ") || "none"})`;
    }
  }

  if (Object.keys(errors).length > 0) {
    const detail = Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join("; ");
    throw new DataValidationError(`mutation args validation failed (${mutation.op}): ${detail}`, errors);
  }
  return { value };
}

export interface ValidatedQueryParams {
  values: Record<string, string | number | boolean>;
  identityValue?: string | number;
}

export function validateQueryParams(
  query: ManifestQuery,
  params: Record<string, unknown>,
): ValidatedQueryParams {
  const errors: Record<string, string> = {};
  const values: Record<string, string | number | boolean> = {};
  let identityValue: string | number | undefined;

  const declared = query.params ?? {};
  const known = new Set<string>(Object.keys(declared));
  if (query.identity) known.add(query.identity);

  for (const [name, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null) continue;
    if (query.identity && name === query.identity) {
      if (typeof raw !== "string" && typeof raw !== "number") {
        errors[name] = "identity filter must be string or number";
      } else {
        identityValue = raw;
      }
      continue;
    }
    const rule: ManifestParam | undefined = declared[name];
    if (!rule) {
      errors[name] = `unknown param "${name}" (allowed: ${[...known].join(", ") || "none"})`;
      continue;
    }
    if (rule.type === "integer") {
      if (typeof raw !== "number" || !Number.isInteger(raw)) {
        errors[name] = "expected integer";
        continue;
      }
      values[name] = raw;
      continue;
    }
    if (rule.type === "boolean") {
      if (typeof raw !== "boolean") {
        errors[name] = "expected boolean";
        continue;
      }
      values[name] = raw;
      continue;
    }
    if (typeof raw !== "string") {
      errors[name] = "expected string";
      continue;
    }
    if (rule.type === "enum" && rule.values && !rule.values.includes(raw)) {
      errors[name] = `value must be one of: ${rule.values.join(", ")}`;
      continue;
    }
    values[name] = raw;
  }

  for (const [name, rule] of Object.entries(declared)) {
    if (rule.default === undefined || values[name] !== undefined) continue;
    if (rule.type === "integer" || rule.type === "boolean") continue;
    values[name] = rule.default;
  }

  if (Object.keys(errors).length > 0) {
    const detail = Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join("; ");
    throw new DataValidationError(`query params validation failed: ${detail}`, errors);
  }
  return { values, identityValue };
}
