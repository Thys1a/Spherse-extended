import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AccessPolicyProvider } from "../../access/access-policy.js";
import type { CardStore, EntryPatch } from "./types.js";
import {
  CardFileCorruptedError,
  CardNotFoundError,
  CardTooLargeError,
  CardWriteFailedError,
  EntryNotFoundError,
  InvalidFieldError,
} from "./types.js";

const READ_CARD_GUIDE =
  "Read a .card.json world book (SillyTavern chara_card_v3 character_book entries). " +
  "Use action=list for the file picker, meta for counts, entries for the entry list (no content), " +
  "entry/entry.many for full entry text. Never read the raw file: entry content is long.";

const SEARCH_CARD_GUIDE =
  "Search .card.json entries by keys/comment/content. Returns matches without full text (content hits carry a snippet). " +
  "Disabled entries are hidden by default; read full text via read_card action=entry.";

const EDIT_CARD_GUIDE =
  "Edit a .card.json world book entry. update patches one entry, bulk patches many, " +
  "add appends a new entry (id auto-assigned), remove deletes one. " +
  "Only whitelisted fields are writable; id and extensions are read-only.";

function errorText(err: unknown): string {
  if (err instanceof CardNotFoundError) {
    return `Error: card file not found: ${err.file}.`;
  }
  if (err instanceof EntryNotFoundError) {
    return `Error: entry ${err.entryId} not found in ${err.file}.`;
  }
  if (err instanceof InvalidFieldError) {
    return `Error: invalid field(s): ${err.fields.join(", ")}. Writable: keys, secondary_keys, comment, content, constant, selective, insertion_order, enabled, position, use_regex.`;
  }
  if (err instanceof CardTooLargeError) {
    return `Error: card file too large: ${err.file}.`;
  }
  if (err instanceof CardWriteFailedError) {
    return `Error: failed to write ${err.file}; the original file was kept.`;
  }
  if (err instanceof CardFileCorruptedError) {
    return `Error: card file is corrupted (unparsable JSON): ${err.file}. It is NOT auto-repaired — report this to the user.`;
  }
  return `Error: ${(err as Error).message}`;
}

function jsonBlock(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

function denied(file: string, err: unknown) {
  return {
    content: [{ type: "text" as const, text: (err as Error).message }],
    details: { path: file, denied: true },
  };
}

function failed(file: string, err: unknown) {
  return {
    content: [{ type: "text" as const, text: errorText(err) }],
    details: { path: file, error: true },
  };
}

const ReadCardParams = Type.Object({
  action: Type.Union(
    [
      Type.Literal("list"),
      Type.Literal("meta"),
      Type.Literal("entries"),
      Type.Literal("entry"),
      Type.Literal("many"),
    ],
    { description: "list: all .card.json files; meta: counts; entries: entry list without content; entry/many: full entry text" },
  ),
  file: Type.Optional(Type.String({ description: "Card file path, relative to project root (required except action=list)" })),
  dir: Type.Optional(Type.String({ description: "Directory to list card files in (action=list only)" })),
  filter: Type.Optional(
    Type.Object({
      enabled: Type.Optional(Type.Boolean()),
      constant: Type.Optional(Type.Boolean()),
    }),
  ),
  id: Type.Optional(Type.Integer({ minimum: 0, description: "Entry id (action=entry)" })),
  ids: Type.Optional(
    Type.Array(Type.Integer({ minimum: 0 }), { description: "Entry ids (action=many)" }),
  ),
});

export function createReadCardTool(
  cardStore: CardStore,
  getPolicy: AccessPolicyProvider,
): AgentTool<typeof ReadCardParams> {
  return {
    name: "read_card",
    label: "Read Card",
    description: READ_CARD_GUIDE,
    parameters: ReadCardParams,
    async execute(_toolCallId, params, _signal) {
      try {
        if (params.action === "list") {
          const policy = getPolicy();
          try {
            if (params.dir) policy.assertRead(params.dir);
          } catch (err) {
            return denied(params.dir ?? "", err);
          }
          const items = await cardStore.list(params.dir);
          const visible = items.filter((i) => policy.canRead(i.path));
          return {
            content: [{ type: "text" as const, text: jsonBlock(visible) }],
            details: { dir: params.dir ?? "" },
          };
        }
        if (!params.file) {
          return {
            content: [{ type: "text" as const, text: "Error: file is required for this action." }],
            details: { path: "", error: true },
          };
        }
        try {
          getPolicy().assertRead(params.file);
        } catch (err) {
          return denied(params.file, err);
        }
        if (params.action === "many" && !params.ids?.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ids is required for action "many".`,
              },
            ],
            details: { path: params.file, error: true },
          };
        }
        try {
          const result =
            params.action === "meta"
              ? await cardStore.meta(params.file)
              : params.action === "entries"
                ? await cardStore.entries(params.file, params.filter)
                : params.action === "many"
                  ? await cardStore.entryMany(params.file, params.ids ?? [])
                  : await cardStore.entry(params.file, params.id ?? -1);
          return {
            content: [{ type: "text" as const, text: jsonBlock(result) }],
            details: { path: params.file },
          };
        } catch (err) {
          return failed(params.file, err);
        }
      } catch (err) {
        return failed(params.file ?? "", err);
      }
    },
  };
}

const SearchCardParams = Type.Object({
  file: Type.String({ description: "Card file path, relative to project root" }),
  query: Type.Optional(Type.String({ description: "Search text; matched against keys/comment/content" })),
  fields: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Literal("keys"),
        Type.Literal("secondary_keys"),
        Type.Literal("comment"),
        Type.Literal("content"),
      ]),
      { description: "Fields to match (default keys + comment)" },
    ),
  ),
  onlyEnabled: Type.Optional(Type.Boolean({ description: "Hide disabled entries (default true)" })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  snippetChars: Type.Optional(Type.Integer({ minimum: 1, maximum: 2000 })),
});

export function createSearchCardTool(
  cardStore: CardStore,
  getPolicy: AccessPolicyProvider,
): AgentTool<typeof SearchCardParams> {
  return {
    name: "search_card",
    label: "Search Card",
    description: SEARCH_CARD_GUIDE,
    parameters: SearchCardParams,
    async execute(_toolCallId, params, _signal) {
      try {
        getPolicy().assertRead(params.file);
      } catch (err) {
        return denied(params.file, err);
      }
      try {
        const result = await cardStore.search(params.file, {
          ...(params.query !== undefined ? { query: params.query } : {}),
          ...(params.fields !== undefined ? { fields: params.fields } : {}),
          ...(params.onlyEnabled !== undefined ? { onlyEnabled: params.onlyEnabled } : {}),
          ...(params.limit !== undefined ? { limit: params.limit } : {}),
          ...(params.snippetChars !== undefined ? { snippetChars: params.snippetChars } : {}),
        });
        return {
          content: [{ type: "text" as const, text: jsonBlock(result) }],
          details: { path: params.file },
        };
      } catch (err) {
        return failed(params.file, err);
      }
    },
  };
}

const CardEntryBody = Type.Object({
  keys: Type.Optional(Type.Array(Type.String())),
  secondary_keys: Type.Optional(Type.Array(Type.String())),
  comment: Type.Optional(Type.String()),
  content: Type.Optional(Type.String()),
  constant: Type.Optional(Type.Boolean()),
  selective: Type.Optional(Type.Boolean()),
  insertion_order: Type.Optional(Type.Number()),
  enabled: Type.Optional(Type.Boolean()),
  position: Type.Optional(Type.Union([Type.Literal("before_char"), Type.Literal("after_char")])),
  use_regex: Type.Optional(Type.Boolean()),
});

const EditCardParams = Type.Object({
  action: Type.Union(
    [Type.Literal("update"), Type.Literal("bulk"), Type.Literal("add"), Type.Literal("remove")],
    { description: "update: patch one entry; bulk: patch many; add: append entry (id auto-assigned); remove: delete one entry" },
  ),
  file: Type.String({ description: "Card file path, relative to project root" }),
  id: Type.Optional(Type.Integer({ minimum: 0, description: "Entry id (update/remove)" })),
  ids: Type.Optional(
    Type.Array(Type.Integer({ minimum: 0 }), { description: "Entry ids (bulk)" }),
  ),
  patch: Type.Optional(CardEntryBody),
  entry: Type.Optional(CardEntryBody),
  idempotencyKey: Type.Optional(Type.String()),
});

export function createEditCardTool(
  cardStore: CardStore,
  getPolicy: AccessPolicyProvider,
): AgentTool<typeof EditCardParams> {
  return {
    name: "edit_card",
    label: "Edit Card",
    description: EDIT_CARD_GUIDE,
    parameters: EditCardParams,
    async execute(_toolCallId, params, _signal) {
      try {
        getPolicy().assertWrite(params.file);
      } catch (err) {
        return denied(params.file, err);
      }
      const missing =
        params.action === "update" || params.action === "remove"
          ? params.id === undefined
            ? "id"
            : null
          : params.action === "bulk"
            ? !params.ids?.length
              ? "ids"
              : !params.patch
                ? "patch"
                : null
            : params.action === "add"
              ? !params.entry
                ? "entry"
                : null
              : !params.patch
                ? "patch"
                : null;
      if (missing) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${missing} is required for action "${params.action}". No changes were made.`,
            },
          ],
          details: { path: params.file, error: true },
        };
      }
      try {
        const patch = (params.patch ?? {}) as EntryPatch;
        const result =
          params.action === "update"
            ? await cardStore.updateEntry(params.file, params.id ?? -1, patch, {
                ...(params.idempotencyKey !== undefined
                  ? { idempotencyKey: params.idempotencyKey }
                  : {}),
              })
            : params.action === "bulk"
              ? await cardStore.bulkUpdate(params.file, params.ids ?? [], patch, {
                  ...(params.idempotencyKey !== undefined
                    ? { idempotencyKey: params.idempotencyKey }
                    : {}),
                })
              : params.action === "add"
                ? await cardStore.addEntry(params.file, (params.entry ?? {}) as EntryPatch, {
                    ...(params.idempotencyKey !== undefined
                      ? { idempotencyKey: params.idempotencyKey }
                      : {}),
                  })
                : await cardStore.removeEntry(params.file, params.id ?? -1);
        return {
          content: [{ type: "text" as const, text: jsonBlock(result) }],
          details: { path: params.file },
        };
      } catch (err) {
        return failed(params.file, err);
      }
    },
  };
}
