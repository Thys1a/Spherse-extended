import { Type, type Static } from "@sinclair/typebox";

const turnContextSnapshot = Type.Object({
  sessionId: Type.String(),
  capturedAt: Type.String(),
  systemPrompt: Type.String(),
  messages: Type.Array(Type.Unknown()),
  tools: Type.Array(
    Type.Object({
      name: Type.String(),
      description: Type.String(),
      parameters: Type.Unknown(),
    }),
  ),
  model: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  thinkingLevel: Type.Optional(
    Type.Union([
      Type.Literal("off"),
      Type.Literal("minimal"),
      Type.Literal("low"),
      Type.Literal("medium"),
      Type.Literal("high"),
      Type.Literal("xhigh"),
      Type.Literal("max"),
    ]),
  ),
  sampling: Type.Optional(
    Type.Object({
      temperature: Type.Optional(Type.Number()),
      topP: Type.Optional(Type.Number()),
    }),
  ),
  currentTokens: Type.Optional(Type.Integer({ minimum: 0 })),
});

const debugSessionEvent = Type.Object({
  seq: Type.Integer(),
  type: Type.String(),
  time: Type.Integer(),
  data: Type.Unknown(),
});

const sessionEventLog = Type.Object({
  sessionId: Type.String(),
  events: Type.Array(debugSessionEvent),
});

export const schemas = {
  turnContextSnapshot,
  sessionEventLog,
} as const;

export type TurnContextSnapshotContract = Static<typeof turnContextSnapshot>;
export type DebugSessionEventContract = Static<typeof debugSessionEvent>;
export type SessionEventLogContract = Static<typeof sessionEventLog>;
