import { Type, type Static } from "@sinclair/typebox";

const commandDefinition = Type.Object({
  name: Type.String(),
  description: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  template: Type.String(),
  filePath: Type.String(),
});

export const schemas = {
  commandDefinition,
  commandListResponse: Type.Array(commandDefinition),
  commandCreateRequest: Type.Object({
    name: Type.String({ minLength: 1 }),
    description: Type.Optional(Type.String()),
    model: Type.Optional(Type.String()),
    template: Type.String({ minLength: 1 }),
  }),
  commandUpdateRequest: Type.Object({
    description: Type.Optional(Type.String()),
    model: Type.Optional(Type.String()),
    template: Type.Optional(Type.String()),
  }),
} as const;

export type CommandDefinitionContract = Static<typeof schemas.commandDefinition>;
export type CommandListResponse = Static<typeof schemas.commandListResponse>;
export type CommandCreateRequest = Static<typeof schemas.commandCreateRequest>;
export type CommandUpdateRequest = Static<typeof schemas.commandUpdateRequest>;
