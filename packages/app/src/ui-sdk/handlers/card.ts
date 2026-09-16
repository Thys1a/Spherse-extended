import type { EntryPatchContract } from "@spherse/contracts";
import { ApiError } from "../../lib/api";
import { registerAction } from "../registry";
import { respond } from "../respond";

function validateCardFileParam(file: unknown): string | null {
  if (typeof file !== "string" || !file) return null;
  if (!file.endsWith(".card.json")) return null;
  const segments = file.replace(/\\/g, "/").split("/");
  if (segments.some((segment) => segment.toLowerCase() === ".spherse")) return null;
  return file;
}

function cardError(err: unknown): { error: string } {
  if (err instanceof ApiError && err.code) return { error: err.code };
  return { error: "request_failed" };
}

registerAction("card.list", async (params, ctx) => {
  const { dir } = params as { dir?: unknown };
  if (!ctx.client) return;
  try {
    const r = await ctx.client.cardList(typeof dir === "string" ? dir : undefined);
    respond(ctx, true, r);
  } catch (err) {
    respond(ctx, false, cardError(err));
  }
});

registerAction("card.meta", async (params, ctx) => {
  const { path } = params as { path: unknown };
  const file = validateCardFileParam(path);
  if (!file || !ctx.client) return;
  try {
    respond(ctx, true, await ctx.client.cardMeta(file));
  } catch (err) {
    respond(ctx, false, cardError(err));
  }
});

registerAction("card.entries", async (params, ctx) => {
  const { path, filter } = params as {
    path: unknown;
    filter?: { enabled?: boolean; constant?: boolean };
  };
  const file = validateCardFileParam(path);
  if (!file || !ctx.client) return;
  try {
    const cleanFilter =
      filter && typeof filter === "object"
        ? {
            ...(typeof filter.enabled === "boolean" ? { enabled: filter.enabled } : {}),
            ...(typeof filter.constant === "boolean" ? { constant: filter.constant } : {}),
          }
        : undefined;
    respond(ctx, true, await ctx.client.cardEntries(file, cleanFilter));
  } catch (err) {
    respond(ctx, false, cardError(err));
  }
});

registerAction("card.search", async (params, ctx) => {
  const { path, query, fields, onlyEnabled, limit, snippetChars } = params as {
    path: unknown;
    query?: unknown;
    fields?: unknown;
    onlyEnabled?: unknown;
    limit?: unknown;
    snippetChars?: unknown;
  };
  const file = validateCardFileParam(path);
  if (!file || !ctx.client) return;
  try {
    respond(
      ctx,
      true,
      await ctx.client.cardSearch({
        path: file,
        ...(typeof query === "string" ? { query } : {}),
        ...(Array.isArray(fields) &&
        fields.every(
          (f) => f === "keys" || f === "secondary_keys" || f === "comment" || f === "content",
        )
          ? { fields: fields as Array<"keys" | "secondary_keys" | "comment" | "content"> }
          : {}),
        ...(typeof onlyEnabled === "boolean" ? { onlyEnabled } : {}),
        ...(typeof limit === "number" ? { limit } : {}),
        ...(typeof snippetChars === "number" ? { snippetChars } : {}),
      }),
    );
  } catch (err) {
    respond(ctx, false, cardError(err));
  }
});

registerAction("card.entry", async (params, ctx) => {
  const { path, id } = params as { path: unknown; id: unknown };
  const file = validateCardFileParam(path);
  if (!file || typeof id !== "number" || !ctx.client) return;
  try {
    respond(ctx, true, await ctx.client.cardEntry(file, id));
  } catch (err) {
    respond(ctx, false, cardError(err));
  }
});

registerAction("card.entry.many", async (params, ctx) => {
  const { path, ids } = params as { path: unknown; ids: unknown };
  const file = validateCardFileParam(path);
  if (!file || !Array.isArray(ids) || !ids.every((i) => typeof i === "number") || !ctx.client)
    return;
  try {
    respond(ctx, true, await ctx.client.cardEntryMany(file, ids as number[]));
  } catch (err) {
    respond(ctx, false, cardError(err));
  }
});

registerAction("card.entry.update", async (params, ctx) => {
  const { path, id, patch, idempotencyKey } = params as {
    path: unknown;
    id: unknown;
    patch: unknown;
    idempotencyKey?: unknown;
  };
  const file = validateCardFileParam(path);
  if (!file || typeof id !== "number" || typeof patch !== "object" || patch === null || !ctx.client)
    return;
  try {
    respond(
      ctx,
      true,
      await ctx.client.cardEntryUpdate(
        file,
        id,
        patch as EntryPatchContract,
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      ),
    );
  } catch (err) {
    respond(ctx, false, cardError(err));
  }
});

registerAction("card.entry.bulk", async (params, ctx) => {
  const { path, ids, patch, idempotencyKey } = params as {
    path: unknown;
    ids: unknown;
    patch: unknown;
    idempotencyKey?: unknown;
  };
  const file = validateCardFileParam(path);
  if (
    !file ||
    !Array.isArray(ids) ||
    !ids.every((i) => typeof i === "number") ||
    typeof patch !== "object" ||
    patch === null ||
    !ctx.client
  )
    return;
  try {
    respond(
      ctx,
      true,
      await ctx.client.cardEntryBulk(
        file,
        ids as number[],
        patch as EntryPatchContract,
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      ),
    );
  } catch (err) {
    respond(ctx, false, cardError(err));
  }
});
