import { Type, type Static } from "@sinclair/typebox";

const skillDefinition = Type.Object({
  name: Type.String(),
  description: Type.String(),
  instructions: Type.String(),
  filePath: Type.String(),
  source: Type.Union([Type.Literal("builtin"), Type.Literal("project"), Type.Literal("user")]),
  files: Type.Array(Type.String()),
  version: Type.Optional(Type.String()),
});

const skillSummary = Type.Object(
  {
    name: Type.String(),
    description: Type.String(),
    filePath: Type.String(),
    source: Type.Union([Type.Literal("builtin"), Type.Literal("project"), Type.Literal("user")]),
    files: Type.Array(Type.String()),
    version: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const userSkillSource = Type.Object({
  key: Type.String(),
  dir: Type.String(),
  custom: Type.Boolean(),
  exists: Type.Boolean(),
  skills: Type.Array(
    Type.Object({
      name: Type.String(),
      description: Type.String(),
      dir: Type.String(),
      enabled: Type.Boolean(),
    }),
  ),
});

export const schemas = {
  skillDefinition,
  skillSummary,
  skillListResponse: Type.Array(skillSummary),
  skillCreateRequest: Type.Object({
    name: Type.String(),
    description: Type.String(),
    instructions: Type.String(),
  }),
  skillInstallRequest: Type.Object({
    zipPath: Type.String(),
  }),
  userSkillSettings: Type.Object({
    customDirs: Type.Array(Type.String()),
    enabled: Type.Array(Type.String()),
  }),
  userSkillSource,
  userSkillSettingsResponse: Type.Object({
    customDirs: Type.Array(Type.String()),
    enabled: Type.Array(Type.String()),
    sources: Type.Array(userSkillSource),
  }),
} as const;

export type SkillDefinitionContract = Static<typeof skillDefinition>;
export type SkillSummaryContract = Static<typeof skillSummary>;
export type SkillListResponse = Static<typeof schemas.skillListResponse>;
export type SkillCreateRequest = Static<typeof schemas.skillCreateRequest>;
export type SkillInstallRequest = Static<typeof schemas.skillInstallRequest>;
export type UserSkillSettings = Static<typeof schemas.userSkillSettings>;
export type UserSkillSettingsResponse = Static<typeof schemas.userSkillSettingsResponse>;
