import { Type, type Static } from "@sinclair/typebox";

const cardSearchField = Type.Union([
  Type.Literal("keys"),
  Type.Literal("secondary_keys"),
  Type.Literal("comment"),
  Type.Literal("content"),
]);

const cardPosition = Type.Union([Type.Literal("before_char"), Type.Literal("after_char")]);

const entryPatch = Type.Object(
  {
    keys: Type.Optional(Type.Array(Type.String())),
    secondary_keys: Type.Optional(Type.Array(Type.String())),
    comment: Type.Optional(Type.String()),
    content: Type.Optional(Type.String()),
    constant: Type.Optional(Type.Boolean()),
    selective: Type.Optional(Type.Boolean()),
    insertion_order: Type.Optional(Type.Number()),
    enabled: Type.Optional(Type.Boolean()),
    position: Type.Optional(cardPosition),
    use_regex: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const cardEntrySummary = Type.Object({
  id: Type.Integer({ minimum: 0 }),
  comment: Type.String(),
  keys: Type.Array(Type.String()),
  constant: Type.Boolean(),
  enabled: Type.Boolean(),
  position: Type.String(),
  insertion_order: Type.Number(),
  words: Type.Integer({ minimum: 0 }),
});

const cardEntry = Type.Object({
  id: Type.Integer({ minimum: 0 }),
  keys: Type.Array(Type.String()),
  secondary_keys: Type.Array(Type.String()),
  comment: Type.String(),
  content: Type.String(),
  constant: Type.Boolean(),
  selective: Type.Boolean(),
  insertion_order: Type.Number(),
  enabled: Type.Boolean(),
  position: Type.String(),
  use_regex: Type.Boolean(),
  extensions: Type.Unknown(),
});

export const cardErrorCode = Type.Union([
  Type.Literal("card_not_found"),
  Type.Literal("entry_not_found"),
  Type.Literal("invalid_json"),
  Type.Literal("invalid_field"),
  Type.Literal("write_failed"),
  Type.Literal("forbidden"),
  Type.Literal("too_large"),
  Type.Literal("bad_request"),
]);

export const schemas = {
  cardListRequest: Type.Object({
    dir: Type.Optional(Type.String({ minLength: 1 })),
  }),
  cardListResponse: Type.Array(
    Type.Object({
      path: Type.String(),
      name: Type.String(),
      entryCount: Type.Integer({ minimum: 0 }),
      bytes: Type.Integer({ minimum: 0 }),
    }),
  ),
  cardMetaRequest: Type.Object({
    path: Type.String({ minLength: 1 }),
  }),
  cardMetaResponse: Type.Object({
    spec: Type.String(),
    name: Type.String(),
    entryCount: Type.Integer({ minimum: 0 }),
    enabledCount: Type.Integer({ minimum: 0 }),
    regexCount: Type.Integer({ minimum: 0 }),
  }),
  cardEntriesRequest: Type.Object({
    path: Type.String({ minLength: 1 }),
    filter: Type.Optional(
      Type.Object({
        enabled: Type.Optional(Type.Boolean()),
        constant: Type.Optional(Type.Boolean()),
      }),
    ),
  }),
  cardEntriesResponse: Type.Array(cardEntrySummary),
  cardSearchRequest: Type.Object({
    path: Type.String({ minLength: 1 }),
    query: Type.Optional(Type.String()),
    fields: Type.Optional(Type.Array(cardSearchField, { minItems: 1 })),
    onlyEnabled: Type.Optional(Type.Boolean()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    snippetChars: Type.Optional(Type.Integer({ minimum: 1, maximum: 2000 })),
  }),
  cardSearchResponse: Type.Object({
    path: Type.String(),
    query: Type.Optional(Type.String()),
    fields: Type.Array(Type.String()),
    onlyEnabled: Type.Boolean(),
    total: Type.Integer({ minimum: 0 }),
    results: Type.Array(
      Type.Object({
        id: Type.Integer({ minimum: 0 }),
        comment: Type.String(),
        keys: Type.Array(Type.String()),
        constant: Type.Boolean(),
        enabled: Type.Boolean(),
        position: Type.String(),
        insertion_order: Type.Number(),
        words: Type.Integer({ minimum: 0 }),
        matched: Type.Array(Type.String()),
        snippet: Type.Optional(Type.String()),
        regexFallback: Type.Optional(Type.Boolean()),
      }),
    ),
  }),
  cardEntryRequest: Type.Object({
    path: Type.String({ minLength: 1 }),
    id: Type.Integer({ minimum: 0 }),
  }),
  cardEntryResponse: cardEntry,
  cardEntryManyRequest: Type.Object({
    path: Type.String({ minLength: 1 }),
    ids: Type.Array(Type.Integer({ minimum: 0 }), { minItems: 1, maxItems: 100 }),
  }),
  cardEntryManyResponse: Type.Array(cardEntry),
  cardEntryUpdateRequest: Type.Object({
    path: Type.String({ minLength: 1 }),
    id: Type.Integer({ minimum: 0 }),
    patch: entryPatch,
    idempotencyKey: Type.Optional(Type.String({ minLength: 1 })),
  }),
  cardEntryUpdateResponse: Type.Object({
    id: Type.Integer({ minimum: 0 }),
    changed: Type.Array(Type.String()),
  }),
  cardEntryBulkRequest: Type.Object({
    path: Type.String({ minLength: 1 }),
    ids: Type.Array(Type.Integer({ minimum: 0 }), { minItems: 1, maxItems: 100 }),
    patch: entryPatch,
    idempotencyKey: Type.Optional(Type.String({ minLength: 1 })),
  }),
  cardEntryBulkResponse: Type.Object({
    count: Type.Integer({ minimum: 0 }),
  }),
  cardErrorCode,
} as const;

export type CardErrorCode = Static<typeof cardErrorCode>;
export type CardListRequest = Static<typeof schemas.cardListRequest>;
export type CardListResponse = Static<typeof schemas.cardListResponse>;
export type CardMetaRequest = Static<typeof schemas.cardMetaRequest>;
export type CardMetaResponse = Static<typeof schemas.cardMetaResponse>;
export type CardEntriesRequest = Static<typeof schemas.cardEntriesRequest>;
export type CardEntriesResponse = Static<typeof schemas.cardEntriesResponse>;
export type CardSearchRequest = Static<typeof schemas.cardSearchRequest>;
export type CardSearchResponse = Static<typeof schemas.cardSearchResponse>;
export type CardEntryRequest = Static<typeof schemas.cardEntryRequest>;
export type CardEntryContract = Static<typeof schemas.cardEntryResponse>;
export type CardEntryManyRequest = Static<typeof schemas.cardEntryManyRequest>;
export type CardEntryManyResponse = Static<typeof schemas.cardEntryManyResponse>;
export type CardEntryUpdateRequest = Static<typeof schemas.cardEntryUpdateRequest>;
export type CardEntryUpdateResponse = Static<typeof schemas.cardEntryUpdateResponse>;
export type CardEntryBulkRequest = Static<typeof schemas.cardEntryBulkRequest>;
export type CardEntryBulkResponse = Static<typeof schemas.cardEntryBulkResponse>;
export type EntryPatchContract = Static<typeof entryPatch>;
