import { Type, type Static } from "@sinclair/typebox";

const fileEntry = Type.Object({
  name: Type.String(),
  type: Type.Union([Type.Literal("file"), Type.Literal("directory")]),
});

const contentCreateRequest = Type.Object({
  action: Type.Union([Type.Literal("mkdir"), Type.Literal("touch")]),
});

const contentMoveRequest = Type.Object({
  action: Type.Literal("move"),
  destination: Type.String({ minLength: 1 }),
});

export const schemas = {
  fileEntry,
  fileEntries: Type.Array(fileEntry),
  contentResponse: Type.Object({
    content: Type.String(),
    path: Type.String(),
    binary: Type.Optional(Type.Boolean()),
  }),
  statResponse: Type.Object({
    size: Type.Number(),
    mtime: Type.Number(),
    isDirectory: Type.Boolean(),
  }),
  contentCreateRequest,
  contentMoveRequest,
  contentMutationRequest: Type.Union([contentCreateRequest, contentMoveRequest]),
  contentSaveRequest: Type.Object({ content: Type.String() }),
} as const;

export type FileEntryContract = Static<typeof fileEntry>;
export type FileEntriesResponse = Static<typeof schemas.fileEntries>;
export type ContentResponseContract = Static<typeof schemas.contentResponse>;
export type StatResponseContract = Static<typeof schemas.statResponse>;
export type ContentCreateRequest = Static<typeof schemas.contentCreateRequest>;
export type ContentMoveRequest = Static<typeof schemas.contentMoveRequest>;
export type ContentMutationRequest = Static<typeof schemas.contentMutationRequest>;
export type ContentSaveRequest = Static<typeof schemas.contentSaveRequest>;
