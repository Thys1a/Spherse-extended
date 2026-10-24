import { Type, type Static } from "@sinclair/typebox";

export const dataReadRequest = Type.Object({
  file: Type.String({ minLength: 1 }),
  key: Type.Optional(Type.String({ minLength: 1 })),
  path: Type.Optional(Type.String({ minLength: 1 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  ifVersion: Type.Optional(Type.String({ minLength: 8 })),
});

export const dataReadResponse = Type.Object({
  version: Type.String(),
  unchanged: Type.Optional(Type.Boolean()),
  value: Type.Optional(Type.Unknown()),
  total: Type.Optional(Type.Integer()),
  offset: Type.Optional(Type.Integer()),
  limit: Type.Optional(Type.Integer()),
  truncated: Type.Optional(Type.Boolean()),
  note: Type.Optional(Type.String()),
});

export const dataMutateRequest = Type.Object({
  file: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
  args: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  idempotencyKey: Type.Optional(Type.String({ minLength: 1 })),
  sessionId: Type.Optional(Type.String({ minLength: 1 })),
  toolCallId: Type.Optional(Type.String({ minLength: 1 })),
});

export const dataMutateResponse = Type.Object({
  version: Type.String(),
  result: Type.Unknown(),
});

export const dataQueryRequest = Type.Object({
  file: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
  params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  after: Type.Optional(Type.String({ minLength: 1 })),
});

export const dataQueryResponse = Type.Object({
  version: Type.String(),
  value: Type.Unknown(),
  total: Type.Integer({ minimum: 0 }),
  count: Type.Integer({ minimum: 0 }),
  pagination: Type.Union([Type.Literal("cursor"), Type.Literal("offset-drift")]),
  nextAfter: Type.Optional(Type.String()),
  truncatedItems: Type.Optional(Type.Array(Type.Integer())),
  note: Type.Optional(Type.String()),
});

export const dataRawSetRequest = Type.Object({
  file: Type.String({ minLength: 1 }),
  key: Type.String({ minLength: 1 }),
  value: Type.Unknown(),
  ifVersion: Type.Optional(Type.String({ minLength: 8 })),
  sessionId: Type.Optional(Type.String({ minLength: 1 })),
  toolCallId: Type.Optional(Type.String({ minLength: 1 })),
});

export const dataRawDeleteRequest = Type.Object({
  file: Type.String({ minLength: 1 }),
  key: Type.String({ minLength: 1 }),
  ifVersion: Type.Optional(Type.String({ minLength: 8 })),
  sessionId: Type.Optional(Type.String({ minLength: 1 })),
  toolCallId: Type.Optional(Type.String({ minLength: 1 })),
});

export const dataWriteResponse = Type.Object({
  version: Type.String(),
});

export const schemas = {
  dataReadRequest,
  dataMutateRequest,
  dataMutateResponse,
  dataReadResponse,
  dataQueryRequest,
  dataQueryResponse,
  dataRawSetRequest,
  dataRawDeleteRequest,
  dataWriteResponse,
} as const;

export type DataReadRequestContract = Static<typeof dataReadRequest>;
export type DataReadResponseContract = Static<typeof dataReadResponse>;
export type DataMutateRequestContract = Static<typeof dataMutateRequest>;
export type DataMutateResponseContract = Static<typeof dataMutateResponse>;
export type DataQueryRequestContract = Static<typeof dataQueryRequest>;
export type DataQueryResponseContract = Static<typeof dataQueryResponse>;
export type DataRawSetRequestContract = Static<typeof dataRawSetRequest>;
export type DataRawDeleteRequestContract = Static<typeof dataRawDeleteRequest>;
export type DataWriteResponseContract = Static<typeof dataWriteResponse>;
