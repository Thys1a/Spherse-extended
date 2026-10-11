import type { Agent, AgentEvent, AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import { prepareAttachmentUserMessage, stripUserAttachments, type Attachment } from "../attachments/index.js";
import type { SamplingParams, ThinkingLevel } from "../types.js";
import { MigrationRequiredError, NotFoundError, ValidationError } from "../errors.js";
import { createEventPipeline, type EventMiddleware } from "../kernel/event-pipeline.js";
import type { SessionControlEvent } from "./types.js";
import { SessionControlBus } from "./control-bus.js";
import { createApprovalGate } from "./approval-gate.js";
import { createAskGate } from "./ask-gate.js";
import type { SessionStatus } from "./status.js";
import { randomUUID } from "node:crypto";
import type { RuntimeDeps, TurnEventPayload } from "./runtime.js";
import { deriveSideEffects, type SideEffectRef } from "../tool-attribution.js";
import { logEventMiddleware } from "./event-middlewares.js";
import {
  createAttachmentSanitizer,
  type AttachmentSanitizer,
} from "../attachments/sanitizer.js";
import { composeTurnHooks, type CompactionOutcome, type TurnHooks } from "../kernel/turn-hooks.js";
import { collectAbandonedSeqs, deriveMessages, repairLog } from "./fold.js";
import { expandSlashMessage } from "./slash.js";
import { SessionEventLog } from "./event-log.js";
import type { SessionEvent, SendMessageMeta } from "./events.js";
import { readCurrentTokens } from "../context/token-estimate.js";
import { markTruncated } from "../context/truncated-turn.js";
import { DEFAULT_THRESHOLD_RATIO } from "../context/compaction.js";
import {
  buildAgent,
  buildPromptAndTools,
  composeStreamFn,
  previewTransformsFor,
  streamDecoratorsFor,
} from "./agent-assembly.js";

export type RunnerEventHandler = (event: AgentEvent | SessionControlEvent) => void;

export const MAX_TOOL_CALLS_PER_TURN = 30;
export const MAX_SAME_TOOLCALL_REPEAT = 3;
export const MAX_CONSECUTIVE_TRUNCATED_TURNS = 3;
const PRE_TURN_COMPACTION_RATIO = DEFAULT_THRESHOLD_RATIO;

export type ToolLoopStopReason = "tool-call-budget" | "tool-call-repeat" | "truncated-loop";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
    return `{${entries.join(",")}}`;
  }
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return "unknown";
  }
}

function loopStopReasonText(reason: ToolLoopStopReason, toolName?: string): string {
  if (reason === "tool-call-repeat") {
    return `Tool call loop guard: "${toolName ?? "unknown tool"}" with identical arguments was blocked ${MAX_SAME_TOOLCALL_REPEAT} times in a row; stopping this turn to avoid an infinite loop.`;
  }
  if (reason === "truncated-loop") {
    return `Tool call loop guard: ${MAX_CONSECUTIVE_TRUNCATED_TURNS} consecutive responses were cut off by the output limit; stopping this turn to avoid an infinite loop.`;
  }
  return `Tool call loop guard: exceeded ${MAX_TOOL_CALLS_PER_TURN} tool calls in a single turn; stopping to avoid an infinite loop.`;
}

export class AgentRunner {
  private eventLog: SessionEventLog | null = null;
  private inFlight = false;
  private turnDepth = 0;
  private turnChainId: string = randomUUID();
  private turnHooks: TurnHooks;
  private capabilityMiddlewares: ReadonlyArray<EventMiddleware<AgentEvent>> = [];
  private pendingReload = false;
  private pendingPromptEstimate: number | null = null;
  private needsAutoRetry = false;
  private autoRetryCount = 0;
  private lastAssistantSeq: number | null = null;
  private compactedThisTurn = false;
  private toolCallTotal = 0;
  private lastToolKey: string | null = null;
  private sameToolRepeat = 0;
  private lengthStreak = 0;
  private toolLoopStop: ToolLoopStopReason | null = null;

  private constructor(
    private readonly agent: Agent,
    private readonly agentId: string,
    private readonly sessionId: string,
    private readonly deps: RuntimeDeps,
    private readonly controlBus: SessionControlBus,
  ) {
    this.turnHooks = composeTurnHooks([]);
  }

  static async init(
    deps: RuntimeDeps,
    agentId: string,
    sessionId: string,
    options?: { eventLog?: SessionEventLog },
  ): Promise<AgentRunner> {
    const agentStore = deps.projectStore.getAgent(agentId);
    if (!agentStore) throw new NotFoundError(`Agent profile "${agentId}" not found`);
    const controlBus = new SessionControlBus();
    const agent = await buildAgent(
      deps,
      agentStore.getProfile(),
      sessionId,
      createApprovalGate(controlBus),
      createAskGate(controlBus),
    );
    const runner = new AgentRunner(agent, agentId, sessionId, deps, controlBus);
    agent.beforeToolCall = async (context) => {
      deps.attribution?.begin(sessionId, context.toolCall.id, {
        turnSeq: runner.currentTurnSeq(),
      });
      return runner.guardToolCall(context.toolCall.name, context.args);
    };
    agent.shouldStopAfterTurn = async ({ message, toolResults }) =>
      runner.checkToolLoopStop(message, toolResults.length);
    runner.turnHooks = composeTurnHooks(
      deps.createTurnHooks ? [deps.createTurnHooks(agentId, sessionId)] : [],
    );
    runner.capabilityMiddlewares = deps.capabilities.flatMap((c) => c.eventMiddlewares ?? []);
    runner.eventLog =
      options?.eventLog ?? SessionEventLog.open(agentStore.sessions, sessionId);
    if (runner.eventLog.events.length > 0) {
      runner.syncBufferFromLog();
    }
    return runner;
  }

  static async initForRestore(
    deps: RuntimeDeps,
    agentId: string,
    sessionId: string,
  ): Promise<AgentRunner> {
    const agentStore = deps.projectStore.getAgent(agentId);
    if (!agentStore) throw new NotFoundError(`Agent "${agentId}" not found`);
    const session = agentStore.sessions.getSession(sessionId);
    if (!session) throw new NotFoundError(`Session "${sessionId}" not found`);
    if (agentStore.sessions.sessionNeedsMigration(sessionId)) {
      throw new MigrationRequiredError(
        `Session "${sessionId}" uses the legacy message format and must be migrated first`,
      );
    }

    const eventLog = SessionEventLog.open(agentStore.sessions, sessionId);
    const repairs = repairLog(eventLog.events);
    eventLog.appendBatch(
      repairs.map((repair) => ({ type: repair.type, data: repair.data })),
    );
    return AgentRunner.init(deps, agentId, sessionId, { eventLog });
  }

  getAgentId(): string {
    return this.agentId;
  }

  get agentRef(): Agent {
    return this.agent;
  }

  get currentEvents(): readonly SessionEvent[] {
    return this.eventLog?.events ?? [];
  }

  subscribeEvents(listener: (event: SessionEvent) => void): (() => void) | null {
    return this.eventLog ? this.eventLog.subscribe(listener) : null;
  }

  appendUserNote(message: AgentMessage, meta?: SendMessageMeta): SessionEvent {
    if (!this.eventLog) throw new NotFoundError(`Session "${this.sessionId}" is not open`);
    return this.eventLog.append("user/message", {
      message,
      ...(meta?.source !== undefined ? { source: meta.source } : {}),
      ...(meta?.triggerName !== undefined ? { triggerName: meta.triggerName } : {}),
      ...(meta?.slash !== undefined ? { slash: meta.slash } : {}),
      ...(meta?.summon !== undefined ? { summon: meta.summon } : {}),
    });
  }

  markReloadPending(): void {
    this.pendingReload = true;
  }

  async sendMessage(
    message: string,
    attachments: ReadonlyArray<Attachment>,
    onEvent: RunnerEventHandler,
    meta?: SendMessageMeta,
    opts?: { modelOverride?: string },
  ): Promise<void> {
    this.ensureNotBusy();
    this.inFlight = true;
    this.turnDepth = meta?.triggerDepth ?? 0;
    this.turnChainId = meta?.triggerChainId ?? randomUUID();
    this.resetToolLoopGuard();
    this.needsAutoRetry = false;
    this.autoRetryCount = 0;
    this.compactedThisTurn = false;
    let sanitizer: AttachmentSanitizer | null = null;
    let unsubscribe: (() => void) | undefined;
    let restoreSink: (() => void) | undefined;
    try {
      if (this.pendingReload) {
        this.pendingReload = false;
        await this.applyReload();
      }
      const slash = await expandSlashMessage(
        {
          projectStore: this.deps.projectStore,
          capabilities: this.deps.capabilities,
        },
        this.agentId,
        message,
      );
      const text = slash?.text ?? message;
      this.ensureModel(slash?.modelOverride ?? opts?.modelOverride);
      this.ensureWritable();
      await this.turnHooks.beforeTurn?.(this.agent);
      const sessionLogger = this.deps.logger.child({ sessionId: this.sessionId });

      sanitizer = createAttachmentSanitizer(attachments);
      const userMessage = await prepareAttachmentUserMessage(
        text,
        attachments,
        this.deps.projectRoot,
        this.deps.attachmentProcessors,
      );
      const sanitizedUserMessage = sanitizer
        ? (stripUserAttachments(userMessage as never, attachments) as typeof userMessage)
        : userMessage;

      await this.maybePreCompact(sanitizedUserMessage as AgentMessage);

      const [userEvent, turnStartEvent] = this.eventLog!.appendBatch([
        {
          type: "user/message",
          data: {
            message: sanitizedUserMessage as never,
            ...(meta?.source !== undefined ? { source: meta.source } : {}),
            ...(meta?.triggerName !== undefined ? { triggerName: meta.triggerName } : {}),
            ...(slash !== null ? { slash: slash.slash } : {}),
            ...(meta?.summon !== undefined ? { summon: meta.summon } : {}),
          },
        },
        { type: "turn/start", data: {} },
      ]);
      this.emitTurnEvent("sp:user-message", {
        sessionId: this.sessionId,
        agentId: this.agentId,
        seq: userEvent.seq,
        depth: this.turnDepth,
        chainId: this.turnChainId,
      });

      const dispatch = createEventPipeline(
        [
          logEventMiddleware(sessionLogger),
          ...this.capabilityMiddlewares,
          ...(sanitizer ? [sanitizer.middleware] : []),
          this.persistMiddleware(),
        ],
        onEvent,
      );

      const previousSink = this.controlBus.swapEventSink(this.persistingControlSink(onEvent));
      restoreSink = () => this.controlBus.swapEventSink(previousSink);
      unsubscribe = this.agent.subscribe(dispatch);

      try {
        this.pendingPromptEstimate = readCurrentTokens(
          [...this.agent.state.messages, sanitizedUserMessage as never],
          this.agent.state.systemPrompt,
        );
        await this.agent.prompt(userMessage);
        await this.applyAfterTurnHooks();
        await this.runAutoRetryIfNeeded();
      } catch (err) {
        this.emitErrorTurnEnd(turnStartEvent.seq);
        throw err;
      }
    } finally {
      this.pendingPromptEstimate = null;
      if (sanitizer) {
        const result = sanitizer.finalize(this.agent.state.messages);
        this.agent.state.messages = result.messages;
      }
      unsubscribe?.();
      restoreSink?.();
      this.inFlight = false;
    }
  }

  async retryLastTurn(onEvent: RunnerEventHandler): Promise<void> {
    this.ensureNotBusy();
    this.inFlight = true;
    this.needsAutoRetry = false;
    this.autoRetryCount = 0;
    this.compactedThisTurn = false;
    let unsubscribe: (() => void) | undefined;
    let restoreSink: (() => void) | undefined;
    try {
      if (this.pendingReload) {
        this.pendingReload = false;
        await this.applyReload();
      }
      const lastEvent = [...this.eventLog!.events]
        .reverse()
        .find((event) => event.type === "assistant/message");
      const lastBuffered = this.agent.state.messages[this.agent.state.messages.length - 1];
      const lastPersisted =
        lastEvent && lastEvent.type === "assistant/message"
          ? (markTruncated(
              (lastEvent as { data: { message: unknown } }).data.message,
            ) as { stopReason?: string })
          : undefined;
      if (
        !lastEvent ||
        lastEvent.type !== "assistant/message" ||
        !lastBuffered ||
        lastBuffered.role !== "assistant" ||
        lastPersisted?.stopReason !== "error"
      ) {
        throw new ValidationError(
          `Session "${this.sessionId}" has no failed assistant turn to retry`,
        );
      }

      this.ensureModel();
      await this.maybePreCompact();
      const [, retryStartEvent] = this.eventLog!.appendBatch([
        { type: "turn/retried", data: { abandonedSeqs: [lastEvent.seq] } },
        { type: "turn/start", data: {} },
      ]);
      this.syncBufferFromLog();
      this.resetToolLoopGuard();
      this.pendingPromptEstimate = readCurrentTokens(
        this.agent.state.messages,
        this.agent.state.systemPrompt,
      );

      const sessionLogger = this.deps.logger.child({ sessionId: this.sessionId });
      const dispatch = createEventPipeline(
        [
          logEventMiddleware(sessionLogger),
          ...this.capabilityMiddlewares,
          this.persistMiddleware(),
        ],
        onEvent,
      );

      const previousSink = this.controlBus.swapEventSink(this.persistingControlSink(onEvent));
      restoreSink = () => this.controlBus.swapEventSink(previousSink);
      unsubscribe = this.agent.subscribe(dispatch);

      try {
        await this.agent.continue();
        await this.applyAfterTurnHooks();
        await this.runAutoRetryIfNeeded();
      } catch (err) {
        this.emitErrorTurnEnd(retryStartEvent.seq);
        throw err;
      }
    } finally {
      this.pendingPromptEstimate = null;
      unsubscribe?.();
      restoreSink?.();
      this.inFlight = false;
    }
  }

  async compactNow(): Promise<CompactionOutcome> {
    this.ensureNotBusy();
    const preTurn = this.deps.preTurnCompaction;
    if (!preTurn || !this.eventLog) {
      throw new ValidationError(
        `Session "${this.sessionId}" compaction is not available`,
      );
    }
    this.inFlight = true;
    try {
      if (this.pendingReload) {
        this.pendingReload = false;
        await this.applyReload();
      }
      this.ensureWritable();
      const result = await preTurn(this.eventLog, this.agent, this.sessionId, { force: true });
      if (result.applied) this.syncBufferFromLog();
      return result;
    } finally {
      this.inFlight = false;
    }
  }

  async withdrawLastTurn(): Promise<number> {
    this.ensureNotBusy();
    const events = this.eventLog!.events;
    const abandoned = collectAbandonedSeqs(events);
    const lastUserEvent = [...events]
      .reverse()
      .find((event) => event.type === "user/message" && !abandoned.has(event.seq));
    if (!lastUserEvent) {
      throw new ValidationError(
        `Session "${this.sessionId}" has no user message to withdraw`,
      );
    }
    const lastCompaction = [...events]
      .reverse()
      .find((event) => event.type === "compaction/applied");
    if (lastCompaction && lastUserEvent.seq <= lastCompaction.data.anchorSeq) {
      throw new ValidationError(
        `Session "${this.sessionId}" last turn is already compacted into a digest and cannot be withdrawn`,
      );
    }
    this.eventLog!.append("turn/withdrawn", { seq: lastUserEvent.seq });
    this.syncBufferFromLog();
    return lastUserEvent.seq;
  }

  private ensureNotBusy(): void {
    if (this.inFlight) {
      throw new ValidationError(
        `Session "${this.sessionId}" already has a turn in progress`,
      );
    }
  }

  private ensureWritable(): void {
    if (!this.eventLog) {
      throw new MigrationRequiredError(
        `Session "${this.sessionId}" has no event log attached`,
      );
    }
  }
  abort(): void {
    this.controlBus.rejectAll("session aborted");
    this.agent.abort();
  }

  resolveControlRequest(requestId: string, decision: unknown): void {
    this.controlBus.resolve(requestId, decision);
  }

  getTurnContext() {
    // Same projection closure the agent loop consumes on the wire path
    // (contextProjectors + role filter), so the snapshot cannot drift from it.
    const raw = structuredClone(this.agent.state.messages);
    const converted = this.agent.convertToLlm(raw);
    let llmMessages: AgentMessage[];
    if (Array.isArray(converted)) {
      llmMessages = converted as AgentMessage[];
    } else {
      // buildAgent always wires a sync convertToLlm; if that ever changes,
      // degrade loudly instead of silently exporting the unprojected buffer.
      this.deps.logger.warn(
        { sessionId: this.sessionId },
        "convertToLlm returned a promise; turn context falls back to raw buffer",
      );
      llmMessages = raw;
    }
    // Replay stream-level message rewrites (e.g. time-perception prefixes)
    // in wire order — previewTransformsFor already reverses registration
    // order to match decorator onion composition.
    const profile = this.deps.projectStore.getAgent(this.agentId)?.getProfile();
    if (!profile) {
      this.deps.logger.warn(
        { sessionId: this.sessionId, agentId: this.agentId },
        "agent profile missing; turn context skips preview transforms",
      );
    } else {
      for (const transform of previewTransformsFor(this.deps.capabilities, this.viewOf(profile))) {
        llmMessages = transform(llmMessages);
      }
    }
    return {
      sessionId: this.sessionId,
      capturedAt: new Date().toISOString(),
      systemPrompt: this.agent.state.systemPrompt,
      messages: llmMessages,
      tools: this.agent.state.tools.map((tool: AgentTool) => ({
        name: tool.name,
        description: tool.description ?? "",
        parameters: structuredClone(tool.parameters),
      })),
    };
  }

  isBusy(): boolean {
    return this.inFlight;
  }

  getStatus(): SessionStatus {
    return {
      currentTokens: readCurrentTokens(this.agent.state.messages, this.agent.state.systemPrompt),
      contextWindowLimit:
        (this.agent.state.model as { contextWindow?: number } | undefined)?.contextWindow ?? null,
    };
  }

  applyDefaultModel(globalDefaultModel: string | undefined): void {
    const profile = this.deps.projectStore.getAgent(this.agentId)?.getProfile();
    if (!profile) return;
    const resolved = this.deps.modelResolver.resolveFor(
      profile,
      globalDefaultModel,
      this.readSessionModel(),
    );
    if (!resolved) return;
    const current = this.agent.state.model;
    if (current?.id !== resolved.id || current?.provider !== resolved.provider) {
      this.agent.state.model = resolved;
    }
  }

  applySessionModel(): void {
    const profile = this.deps.projectStore.getAgent(this.agentId)?.getProfile();
    if (!profile) return;
    const resolved = this.deps.modelResolver.resolveFor(
      profile,
      this.deps.runConfig.current().defaultModel,
      this.readSessionModel(),
    );
    if (!resolved) return;
    const current = this.agent.state.model;
    if (current?.id !== resolved.id || current?.provider !== resolved.provider) {
      this.agent.state.model = resolved;
    }
  }

  applySampling(sampling: SamplingParams | undefined): void {
    const profile = this.deps.projectStore.getAgent(this.agentId)?.getProfile();
    if (!profile) return;
    this.agent.streamFunction = composeStreamFn(
      this.deps.modelCatalog,
      sampling,
      streamDecoratorsFor(this.deps.capabilities, this.viewOf(profile)),
    );
  }

  applyThinkingLevel(thinkingLevel: ThinkingLevel | undefined): void {
    const profile = this.deps.projectStore.getAgent(this.agentId)?.getProfile();
    const next = profile?.thinkingLevel ?? thinkingLevel ?? "medium";
    if (this.agent.state.thinkingLevel !== next) {
      this.agent.state.thinkingLevel = next;
    }
  }

  private viewOf(profile: import("../types.js").AgentProfile): import("../kernel/ports.js").SessionView {
    return {
      agentId: this.agentId,
      profile,
      projectStore: this.deps.projectStore,
      stores: this.deps.stores,
    };
  }

  async applyReload(): Promise<void> {
    const agentStore = this.deps.projectStore.getAgent(this.agentId);
    if (!agentStore) return;
    try {
      const profile = agentStore.getProfile();
      const { systemPrompt, tools } = await buildPromptAndTools(
        this.deps,
        profile,
        this.sessionId,
        createApprovalGate(this.controlBus),
        createAskGate(this.controlBus),
      );
      this.agent.state.systemPrompt = systemPrompt;
      this.agent.state.tools = tools;
      this.applyDefaultModel(this.deps.runConfig.current().defaultModel);
      this.applyThinkingLevel(this.deps.runConfig.current().thinkingLevel);
      this.agent.streamFunction = composeStreamFn(
        this.deps.modelCatalog,
        this.deps.runConfig.current().sampling,
        streamDecoratorsFor(this.deps.capabilities, this.viewOf(profile)),
      );
      this.turnHooks.onReload?.();
      this.deps.logger.info(
        { sessionId: this.sessionId, agentId: this.agentId },
        "agent config reloaded for live session",
      );
    } catch (err) {
      this.deps.logger.warn(
        { err, sessionId: this.sessionId, agentId: this.agentId },
        "agent config reload failed, keeping previous config",
      );
    }
  }

  private async applyAfterTurnHooks(): Promise<void> {
    if (!this.turnHooks.afterTurn || !this.eventLog) return;
    if (this.compactedThisTurn) {
      this.compactedThisTurn = false;
      return;
    }
    const eventsBefore = this.eventLog.events.length;
    await this.turnHooks.afterTurn(this.agent, this.eventLog);
    if (this.eventLog.events.length !== eventsBefore) {
      this.syncBufferFromLog();
    }
  }

  private async runAutoRetryIfNeeded(): Promise<void> {
    if (!this.needsAutoRetry || this.autoRetryCount >= 1 || !this.eventLog) {
      this.needsAutoRetry = false;
      return;
    }
    this.needsAutoRetry = false;
    this.autoRetryCount += 1;
    this.syncBufferFromLog();
    this.resetToolLoopGuard();
    const lastBuffered = this.agent.state.messages[this.agent.state.messages.length - 1];
    if (!lastBuffered || lastBuffered.role === "assistant") {
      this.endRetriedTurnAsError();
      return;
    }
    this.pendingPromptEstimate = readCurrentTokens(
      this.agent.state.messages,
      this.agent.state.systemPrompt,
    );
    try {
      await this.agent.continue();
      await this.applyAfterTurnHooks();
    } finally {
      this.pendingPromptEstimate = null;
    }
    if (this.needsAutoRetry) {
      this.needsAutoRetry = false;
      this.endRetriedTurnAsError();
    }
  }

  private endRetriedTurnAsError(): void {
    if (!this.eventLog) return;
    const turnEnd = this.eventLog.append("turn/end", { reason: "error" });
    this.emitTurnEvent("sp:turn-end", {
      sessionId: this.sessionId,
      agentId: this.agentId,
      seq: turnEnd.seq,
      reason: "error",
      depth: this.turnDepth,
      chainId: this.turnChainId,
    });
  }

  private persistingControlSink(onEvent: RunnerEventHandler): RunnerEventHandler {
    return (event) => {
      if (
        !this.eventLog ||
        (event.type !== "control_request" && event.type !== "control_resolved")
      ) {
        onEvent(event);
        return;
      }
      if (event.type === "control_request") {
        const persisted = this.eventLog.append("control/requested", {
          requestId: event.requestId,
          kind: event.kind,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
        });
        onEvent({ ...event, seq: persisted.seq });
        return;
      }
      const persisted = this.eventLog.append("control/resolved", {
        requestId: event.requestId,
        kind: event.kind,
        ...(event.kind === "approval"
          ? { approved: event.approved, ...(event.reason !== undefined ? { reason: event.reason } : {}) }
          : {}),
        ...(event.kind === "question"
          ? { ...(event.answer !== undefined ? { answer: event.answer } : {}), timedOut: event.timedOut }
          : {}),
        ...(event.aborted !== undefined ? { aborted: event.aborted } : {}),
      });
      onEvent({ ...event, seq: persisted.seq });
    };
  }

  private persistMiddleware(): EventMiddleware<AgentEvent> {
    return (event, next) => {
      if (this.eventLog) {
        if (event.type === "message_end") {
          this.appendMessageEvent(event.message);
        } else if (event.type === "agent_end") {
          const lastMessage = [...event.messages]
            .reverse()
            .find((message) => message.role === "assistant") as
            | { stopReason?: string; rawStopReason?: string }
            | undefined;
          const marked = (
            lastMessage === undefined ? undefined : markTruncated(lastMessage)
          ) as { stopReason?: string; rawStopReason?: string } | undefined;
          if (marked?.stopReason === "error" && marked?.rawStopReason === "length") {
            this.abandonTruncatedTurn();
            next(event);
            return;
          }
          const reason =
            marked?.stopReason === "error"
              ? "error"
              : marked?.stopReason === "aborted"
                ? "aborted"
                : "completed";
          const turnEnd = this.eventLog.append("turn/end", { reason });
          this.emitTurnEvent("sp:turn-end", {
            sessionId: this.sessionId,
            agentId: this.agentId,
            seq: turnEnd.seq,
            reason,
            depth: this.turnDepth,
            chainId: this.turnChainId,
          });
        }
      }
      next(event);
    };
  }

  private currentTurnSeq(): number {
    const events = this.eventLog?.events ?? [];
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "turn/start") return events[i].seq;
    }
    return 0;
  }

  getTriggerChain(): { depth: number; chainId: string } {
    return { depth: this.turnDepth, chainId: this.turnChainId };
  }

  private resetToolLoopGuard(): void {
    this.toolCallTotal = 0;
    this.lastToolKey = null;
    this.sameToolRepeat = 0;
    this.lengthStreak = 0;
    this.toolLoopStop = null;
  }

  private guardToolCall(
    toolName: string,
    args: unknown,
  ): { block: true; terminate: true; reason: string } | undefined {
    if (this.toolLoopStop !== null) {
      return { block: true, terminate: true, reason: loopStopReasonText(this.toolLoopStop, toolName) };
    }
    const key = `${toolName}\n${canonicalJson(args)}`;
    if (key === this.lastToolKey) {
      this.sameToolRepeat += 1;
    } else {
      this.lastToolKey = key;
      this.sameToolRepeat = 1;
    }
    if (this.sameToolRepeat >= MAX_SAME_TOOLCALL_REPEAT) {
      this.toolLoopStop = "tool-call-repeat";
      this.deps.logger.warn(
        { sessionId: this.sessionId, toolName },
        "tool call loop guard stopped turn: same tool and arguments repeated",
      );
      return { block: true, terminate: true, reason: loopStopReasonText(this.toolLoopStop, toolName) };
    }
    return undefined;
  }

  private checkToolLoopStop(message: { stopReason?: string }, resultCount: number): boolean {
    this.toolCallTotal += resultCount;
    if (message.stopReason === "length") {
      this.lengthStreak += 1;
    } else {
      this.lengthStreak = 0;
    }
    if (this.toolLoopStop !== null) return true;
    if (this.toolCallTotal > MAX_TOOL_CALLS_PER_TURN) {
      this.toolLoopStop = "tool-call-budget";
    } else if (this.lengthStreak >= MAX_CONSECUTIVE_TRUNCATED_TURNS) {
      this.toolLoopStop = "truncated-loop";
    } else {
      return false;
    }
    this.deps.logger.warn(
      { sessionId: this.sessionId, reason: this.toolLoopStop },
      "tool call loop guard stopped turn",
    );
    return true;
  }

  private async maybePreCompact(newMessage?: AgentMessage): Promise<void> {
    const preTurn = this.deps.preTurnCompaction;
    if (!preTurn || !this.eventLog) return;
    const window =
      (this.agent.state.model as { contextWindow?: number } | undefined)?.contextWindow ?? 32768;
    const estimate = readCurrentTokens(
      newMessage === undefined
        ? this.agent.state.messages
        : [...deriveMessages(this.eventLog.events), newMessage],
      this.agent.state.systemPrompt,
    );
    if (estimate <= window * PRE_TURN_COMPACTION_RATIO) return;
    const eventsBefore = this.eventLog.events.length;
    try {
      await preTurn(this.eventLog, this.agent, this.sessionId);
    } catch (err) {
      this.deps.logger.warn(
        { err, sessionId: this.sessionId },
        "pre-turn compaction failed, continuing without compaction",
      );
      return;
    }
    if (this.eventLog.events.length !== eventsBefore) {
      this.syncBufferFromLog();
      this.compactedThisTurn = true;
    }
  }

  private abandonTruncatedTurn(): void {
    if (!this.eventLog) return;
    const failed = [...this.eventLog.events]
      .reverse()
      .find((event) => event.type === "assistant/message");
    const failedSeq = failed && failed.type === "assistant/message"
      ? failed.seq
      : this.lastAssistantSeq;
    if (failedSeq === null || failedSeq === undefined) return;
    this.eventLog.appendBatch([
      { type: "turn/retried", data: { abandonedSeqs: [failedSeq] } },
      { type: "turn/start", data: {} },
    ]);
    this.needsAutoRetry = true;
  }

  private appendMessageEvent(message: unknown): void {
    const role = (message as { role?: string }).role;
    if (role === "assistant") {
      const marked = markTruncated(message) as Record<string, unknown>;
      const stamped =
        this.pendingPromptEstimate === null
          ? marked
          : { ...marked, promptEstimate: this.pendingPromptEstimate };
      const appended = this.eventLog!.append("assistant/message", { message: stamped as never });
      this.lastAssistantSeq = appended.seq;
      this.emitTurnEvent("sp:assistant-message", {
        sessionId: this.sessionId,
        agentId: this.agentId,
        seq: appended.seq,
        depth: this.turnDepth,
        chainId: this.turnChainId,
      });
    } else if (role === "toolResult") {
      const result = message as {
        toolCallId?: unknown;
        toolName?: unknown;
        details?: unknown;
        isError?: unknown;
      };
      let sideEffects: SideEffectRef[] | undefined;
      const registry = this.deps.attribution;
      if (registry && typeof result.toolCallId === "string") {
        const attribution = registry.attribute(this.sessionId, result.toolCallId);
        registry.drop(this.sessionId, result.toolCallId);
        if (
          attribution !== undefined &&
          result.isError !== true &&
          typeof result.toolName === "string"
        ) {
          const refs = deriveSideEffects(result.toolName, result.details);
          if (refs.length > 0) sideEffects = refs;
        }
      }
      this.eventLog!.append("tool/result", {
        message: message as never,
        ...(sideEffects !== undefined ? { sideEffects } : {}),
      });
    }
  }

  private emitErrorTurnEnd(turnStartSeq: number): void {
    const ended = this.eventLog!.events.some(
      (event) => event.type === "turn/end" && event.seq > turnStartSeq,
    );
    if (ended) return;
    this.emitTurnEvent("sp:turn-end", {
      sessionId: this.sessionId,
      agentId: this.agentId,
      seq: turnStartSeq,
      reason: "error",
      depth: this.turnDepth,
      chainId: this.turnChainId,
    });
  }

  private emitTurnEvent(name: string, payload: TurnEventPayload): void {
    try {
      this.deps.onTurnEvent?.({ name, payload });
    } catch (err) {
      this.deps.logger.warn(
        { err, sessionId: this.sessionId, name },
        "turn event listener failed",
      );
    }
  }

  private syncBufferFromLog(): void {
    if (this.eventLog) {
      this.agent.state.messages = deriveMessages(this.eventLog.events);
    }
  }

  private ensureModel(modelOverride?: string): void {
    const profile = this.deps.projectStore.getAgent(this.agentId)?.getProfile();
    if (!profile) throw new NotFoundError(`Agent "${this.agentId}" not found`);
    if (modelOverride) {
      try {
        this.deps.modelCatalog.resolveModelById(modelOverride);
      } catch {
        throw new ValidationError(`Unknown model: ${modelOverride}`);
      }
    }
    this.agent.state.model = this.deps.modelResolver.resolveOrThrow(
      profile,
      this.deps.runConfig.current().defaultModel,
      modelOverride ?? this.readSessionModel(),
    );
  }

  private readSessionModel(): string | undefined {
    return (
      this.deps.projectStore.getAgent(this.agentId)?.sessions.getSession(this.sessionId)?.model ??
      undefined
    );
  }
}
