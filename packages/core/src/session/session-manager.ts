import type { AgentChangePayload } from "../store/project.js";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Logger } from "../logger.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { AgentRunner, type RunnerEventHandler } from "./agent-runner.js";
import { SessionEventLog } from "./event-log.js";
import type { SendMessageMeta, SessionEvent } from "./events.js";
import { deriveMessages } from "./fold.js";
import { computeSessionStatus, type SessionStatus } from "./status.js";
import type { TurnContextSnapshot } from "./types.js";
import type { Attachment } from "../attachments/index.js";
import { RunConfigHolder, type RuntimeDeps } from "./runtime.js";
import { migrateLegacySession } from "./legacy-migrate.js";

export class SessionManager {
  private readonly sessions = new Map<string, AgentRunner>();
  private readonly deps: RuntimeDeps;
  private readonly runConfigHolder: RunConfigHolder;
  private readonly appendChains = new Map<string, Promise<void>>();

  constructor(deps: RuntimeDeps, options?: { initialRunConfig?: RunConfigHolder }) {
    this.deps = deps;
    this.runConfigHolder = options?.initialRunConfig ?? new RunConfigHolder();
    deps.projectStore.on("agent_updated", (payload: AgentChangePayload) => {
      if (payload.action !== "updated") return;
      for (const session of this.sessions.values()) {
        if (session.getAgentId() === payload.agentId) session.markReloadPending();
      }
    });
  }

  get logger(): Logger {
    return this.deps.logger;
  }

  getRuntimeDeps(): RuntimeDeps {
    return this.deps;
  }

  getRunConfigHolder(): RunConfigHolder {
    return this.runConfigHolder;
  }

  async createSession(agentId: string, source?: string, title?: string): Promise<string> {
    const agentStore = this.deps.projectStore.getAgent(agentId);
    if (!agentStore) throw new NotFoundError(`Agent profile "${agentId}" not found`);
    const sessionId = agentStore.sessions.createSession(title, source);
    const eventLog = SessionEventLog.open(agentStore.sessions, sessionId);
    const session = await AgentRunner.init(this.deps, agentId, sessionId, { eventLog });
    this.sessions.set(sessionId, session);
    this.deps.logger.info({ sessionId, agentId }, "session created");
    return sessionId;
  }

  async restoreSession(agentId: string, sessionId: string): Promise<string> {
    if (this.sessions.has(sessionId)) return sessionId;
    this.ensureMigrated(agentId, sessionId);
    const session = await AgentRunner.initForRestore(this.deps, agentId, sessionId);
    this.sessions.set(sessionId, session);
    this.deps.logger.info({ sessionId }, "session restored");
    return sessionId;
  }

  private ensureMigrated(agentId: string, sessionId: string): void {
    const agentStore = this.deps.projectStore.getAgent(agentId);
    if (!agentStore) throw new NotFoundError(`Agent "${agentId}" not found`);
    migrateLegacySession(agentStore.sessions, sessionId);
  }

  async sendMessage(
    sessionId: string,
    message: string,
    attachments: Attachment[],
    onEvent: RunnerEventHandler,
    meta?: SendMessageMeta,
    opts?: { modelOverride?: string },
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundError(`No active session "${sessionId}"`);
    return session.sendMessage(message, attachments, onEvent, meta, opts);
  }

  abortSession(sessionId: string): void {
    this.sessions.get(sessionId)?.abort();
  }

  async retryLastTurn(
    sessionId: string,
    onEvent: RunnerEventHandler,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundError(`No active session "${sessionId}"`);
    return session.retryLastTurn(onEvent);
  }

  async withdrawLastTurn(sessionId: string): Promise<number> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundError(`No active session "${sessionId}"`);
    return session.withdrawLastTurn();
  }

  async appendUserMessage(
    agentId: string,
    sessionId: string,
    message: string,
    meta?: SendMessageMeta,
  ): Promise<number> {
    const prev = this.appendChains.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = prev.then(() => turn);
    this.appendChains.set(sessionId, chained);
    await prev;
    try {
      return this.appendUserMessageInner(agentId, sessionId, message, meta);
    } finally {
      release();
      if (this.appendChains.get(sessionId) === chained) {
        this.appendChains.delete(sessionId);
      }
    }
  }

  private appendUserMessageInner(
    agentId: string,
    sessionId: string,
    message: string,
    meta?: SendMessageMeta,
  ): number {
    const record: AgentMessage = {
      role: "user",
      content: message,
      timestamp: Date.now(),
    };
    const active = this.sessions.get(sessionId);
    if (active) return active.appendUserNote(record, meta).seq;
    const agentStore = this.deps.projectStore.getAgent(agentId);
    if (!agentStore) throw new NotFoundError(`Agent "${agentId}" not found`);
    if (!agentStore.sessions.getSession(sessionId)) {
      throw new NotFoundError(`Session "${sessionId}" not found`);
    }
    return SessionEventLog.open(agentStore.sessions, sessionId).append("user/message", {
      message: record,
      ...(meta?.source !== undefined ? { source: meta.source } : {}),
      ...(meta?.triggerName !== undefined ? { triggerName: meta.triggerName } : {}),
      ...(meta?.slash !== undefined ? { slash: meta.slash } : {}),
      ...(meta?.summon !== undefined ? { summon: meta.summon } : {}),
    }).seq;
  }

  resolveControlRequest(sessionId: string, requestId: string, decision: unknown): void {
    this.sessions.get(sessionId)?.resolveControlRequest(requestId, decision);
  }

  getTurnContext(sessionId: string): TurnContextSnapshot {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundError(`No active session "${sessionId}"`);
    return session.getTurnContext();
  }

  subscribeSessionEvents(
    sessionId: string,
    listener: (event: SessionEvent) => void,
  ): (() => void) | null {
    return this.sessions.get(sessionId)?.subscribeEvents(listener) ?? null;
  }

  readSessionEventsAfter(
    agentId: string,
    sessionId: string,
    sinceSeq: number,
    limit: number,
  ): SessionEvent[] {
    const runner = this.sessions.get(sessionId);
    if (runner) {
      const start = Math.max(0, sinceSeq + 1);
      return runner.currentEvents.slice(start, start + limit);
    }
    const agentStore = this.deps.projectStore.getAgent(agentId);
    if (!agentStore) throw new NotFoundError(`Agent "${agentId}" not found`);
    return agentStore.sessions.readEventsAfter(sessionId, sinceSeq, limit);
  }

  getSessionLastSeq(agentId: string, sessionId: string): number {
    const runner = this.sessions.get(sessionId);
    if (runner) {
      const events = runner.currentEvents;
      return events.length > 0 ? events[events.length - 1].seq : -1;
    }
    const agentStore = this.deps.projectStore.getAgent(agentId);
    if (!agentStore) throw new NotFoundError(`Agent "${agentId}" not found`);
    return agentStore.sessions.maxSeq(sessionId) ?? -1;
  }

  getSessionStatus(agentId: string, sessionId: string): SessionStatus {
    const runner = this.sessions.get(sessionId);
    if (runner) return runner.getStatus();
    const agentStore = this.deps.projectStore.getAgent(agentId);
    if (!agentStore) throw new NotFoundError(`Agent "${agentId}" not found`);
    if (!agentStore.sessions.getSession(sessionId)) {
      throw new NotFoundError(`Session "${sessionId}" not found`);
    }
    const messages = agentStore.sessions.sessionNeedsMigration(sessionId)
      ? agentStore.sessions.getSessionMessages(sessionId)
      : deriveMessages(agentStore.sessions.readEvents(sessionId));
    return computeSessionStatus(
      messages,
      agentStore.getProfile(),
      this.deps.modelCatalog.resolveModelById.bind(this.deps.modelCatalog),
      this.runConfigHolder.current().defaultModel,
      agentStore.sessions.getSession(sessionId)?.model,
    );
  }

  destroySession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  hasActiveSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  sessionExists(agentId: string, sessionId: string): boolean {
    if (this.sessions.has(sessionId)) return true;
    const agentStore = this.deps.projectStore.getAgent(agentId);
    return agentStore?.sessions.getSession(sessionId)?.status === "active";
  }

  evictAgent(agentId: string): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.getAgentId() === agentId) {
        this.sessions.delete(sessionId);
      }
    }
  }

  async closeAll(): Promise<void> {
    this.sessions.clear();
  }

  setDefaultModel(model: string | undefined): void {
    this.runConfigHolder.update({ defaultModel: model });
    for (const session of this.sessions.values()) {
      session.applyDefaultModel(model);
    }
  }

  setSessionModel(agentId: string, sessionId: string, modelId: string): string | null {
    const agentStore = this.deps.projectStore.getAgent(agentId);
    if (!agentStore) throw new NotFoundError(`Agent "${agentId}" not found`);
    const session = agentStore.sessions.getSession(sessionId);
    if (!session) throw new NotFoundError(`Session "${sessionId}" not found`);
    const trimmed = modelId.trim();
    if (trimmed) {
      try {
        this.deps.modelCatalog.resolveModelById(trimmed);
      } catch {
        throw new ValidationError(`Unknown model: ${trimmed}`);
      }
    }
    const next = trimmed || null;
    agentStore.sessions.setSessionModel(sessionId, next);
    this.sessions.get(sessionId)?.applySessionModel();
    return next;
  }

  setSampling(sampling: Parameters<RunConfigHolder["update"]>[0]["sampling"]): void {
    this.runConfigHolder.update({ sampling });
    for (const session of this.sessions.values()) {
      session.applySampling(sampling);
    }
  }

  setThinkingLevel(thinkingLevel: Parameters<RunConfigHolder["update"]>[0]["thinkingLevel"]): void {
    this.runConfigHolder.update({ thinkingLevel });
    for (const session of this.sessions.values()) {
      session.applyThinkingLevel(thinkingLevel);
    }
  }
}
