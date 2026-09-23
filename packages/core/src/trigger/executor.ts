import { EventEmitter } from "node:events";
import type { SessionEventPayload, SessionPort } from "../kernel/ports.js";
import type { TriggerStore } from "../store/trigger.js";
import type { TriggerEntry, TriggerLogEntry } from "../types.js";
import { type Logger, createSilentLogger } from "../logger.js";
import { ValidationError } from "../errors.js";
import { resolveTemplateVars } from "./template.js";
import { randomUUID } from "node:crypto";

const MAX_TRIGGER_DEPTH = 5;
const MAX_TRACKED_CHAINS = 1024;
const MAX_DEFERRED_PER_SESSION = 20;

export interface TriggerFireOptions {
  depth?: number;
  chainId?: string;
  deferredAttempts?: number;
}

interface DeferredFire {
  entry: TriggerEntry;
  agentId: string;
  agentName: string;
  payload: string;
  eventName: string | undefined;
  opts: TriggerFireOptions;
}

export interface TriggerExecutorDeps {
  session: SessionPort;
  getTriggerStore(agentId: string): TriggerStore | null;
  logger?: Logger;
}

function readTurnError(event: SessionEventPayload): string | undefined {
  const messages = event.messages;
  if (!Array.isArray(messages)) return undefined;
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => (message as { role?: string })?.role === "assistant") as
    | { stopReason?: string; errorMessage?: string }
    | undefined;
  if (lastAssistant?.stopReason === "error") {
    return lastAssistant.errorMessage
      ? `turn ended with error: ${lastAssistant.errorMessage}`
      : 'turn ended with stopReason "error"';
  }
  if (lastAssistant?.stopReason === "aborted") {
    return "turn aborted";
  }
  return undefined;
}

export class TriggerExecutor extends EventEmitter {
  private readonly inProgress = new Set<string>();
  private readonly sessionQueues = new Map<string, Promise<void>>();
  private readonly deferred = new Map<string, DeferredFire[]>();
  private readonly chainFiredTriggers = new Map<string, Set<string>>();
  private readonly logger: Logger;

  constructor(private readonly deps: TriggerExecutorDeps) {
    super();
    this.logger = deps.logger ?? createSilentLogger();
  }

  isRunning(triggerId: string): boolean {
    return this.inProgress.has(triggerId);
  }

  forgetAll(): void {
    this.inProgress.clear();
    this.sessionQueues.clear();
    this.deferred.clear();
  }

  private deferUntilTurnEnd(
    entry: TriggerEntry,
    agentId: string,
    agentName: string,
    payload: string,
    eventName: string | undefined,
    opts: TriggerFireOptions | undefined,
    sessionId: string,
    logEntry: TriggerLogEntry,
  ): void {
    let queue = this.deferred.get(sessionId);
    if (!queue) {
      queue = [];
      this.deferred.set(sessionId, queue);
    }
    if (queue.length >= MAX_DEFERRED_PER_SESSION) {
      queue.shift();
      this.logger.warn({ agentId, triggerId: entry.id, sessionId }, "trigger deferred queue full, dropped oldest");
    }
    queue.push({ entry, agentId, agentName, payload, eventName, opts: opts ?? {} });
    this.logger.warn({ agentId, triggerId: entry.id, sessionId }, "trigger deferred: target session busy, will retry at turn end");
    this.deps.getTriggerStore(agentId)?.appendLog({
      ...logEntry,
      completedAt: Date.now(),
      status: "failed",
      error: "session busy (turn in progress), deferred until turn end",
    });
  }

  drainDeferred(sessionId: string): void {
    const pending = this.deferred.get(sessionId);
    if (!pending || pending.length === 0) return;
    this.deferred.delete(sessionId);
    for (const item of pending) {
      void this.fire(item.entry, item.agentId, item.agentName, item.payload, item.eventName, {
        ...item.opts,
        deferredAttempts: (item.opts.deferredAttempts ?? 0) + 1,
      });
    }
  }

  async fire(
    entry: TriggerEntry,
    agentId: string,
    agentName: string,
    payload: string,
    eventName?: string,
    opts?: TriggerFireOptions,
  ): Promise<void> {
    const depth = opts?.depth ?? 0;
    const chainId = opts?.chainId ?? randomUUID();

    const logEntry: TriggerLogEntry = {
      triggerId: entry.id,
      triggerName: entry.name || (entry.type === "time" ? entry.cron! : entry.eventName!),
      agentName,
      eventName,
      sessionId: "",
      triggeredAt: Date.now(),
      status: "running",
    };
    if (depth >= MAX_TRIGGER_DEPTH) {
      this.logger.warn(
        { agentId, triggerId: entry.id, eventName, depth, chainId },
        "trigger skipped: max chain depth exceeded",
      );
      this.deps.getTriggerStore(agentId)?.appendLog({
        ...logEntry,
        completedAt: Date.now(),
        status: "failed",
        error: `max trigger depth exceeded (depth ${depth} >= ${MAX_TRIGGER_DEPTH})`,
      });
      return;
    }

    if (this.inProgress.has(entry.id)) return;
    const chainSeen = this.chainFiredTriggers.get(chainId);
    if (chainSeen?.has(entry.id)) {
      this.logger.debug(
        { agentId, triggerId: entry.id, eventName, chainId },
        "trigger skipped: already fired in this chain",
      );
      this.deps.getTriggerStore(agentId)?.appendLog({
        ...logEntry,
        completedAt: Date.now(),
        status: "failed",
        error: `already fired in this chain${eventName ? ` (event "${eventName}")` : ""}, skipped`,
      });
      return;
    }
    this.inProgress.add(entry.id);

    const triggerName = logEntry.triggerName;

    let sessionId = "";
    let releaseQueue = (): void => {};
    let queuedTurn: Promise<void> | undefined;

    try {
      this.emit("trigger_triggered", { agentId, triggerId: entry.id, eventName, triggeredAt: logEntry.triggeredAt });

      switch (entry.mode) {
        case "new_session": {
          sessionId = await this.deps.session.createSession(agentId, "triggered");
          break;
        }
        case "existing_session": {
          if (!entry.targetSessionId) {
            const err = "existing_session mode but no targetSessionId";
            this.logger.error({ triggerId: entry.id }, err);
            throw new Error(err);
          }
          if (!this.deps.session.sessionExists(agentId, entry.targetSessionId)) {
            const err = `existing_session target "${entry.targetSessionId}" is not an active session`;
            this.logger.error({ triggerId: entry.id }, err);
            throw new Error(err);
          }
          sessionId = entry.targetSessionId;
          await this.deps.session.restoreSession(agentId, sessionId);
          break;
        }
        case "reusable_session": {
          const bound = entry.boundSessionId;
          if (bound && this.deps.session.sessionExists(agentId, bound)) {
            sessionId = bound;
            await this.deps.session.restoreSession(agentId, sessionId);
          } else {
            sessionId = await this.deps.session.createSession(agentId, "triggered");
            this.deps.getTriggerStore(agentId)?.update(entry.id, { boundSessionId: sessionId });
          }
          break;
        }
        default: {
          const err = `unknown trigger mode: ${(entry as TriggerEntry).mode}`;
          this.logger.error({ triggerId: entry.id }, err);
          throw new Error(err);
        }
      }

      logEntry.sessionId = sessionId;
      this.deps.getTriggerStore(agentId)?.appendLog(logEntry);

      const resolvedMessage = resolveTemplateVars(entry.message, { agentName, payload });

      let agentEnded = false;
      let turnError: string | undefined;

      const prevTurn = this.sessionQueues.get(sessionId) ?? Promise.resolve();
      const gate = new Promise<void>((resolve) => {
        releaseQueue = resolve;
      });
      queuedTurn = prevTurn.then(() => gate);
      this.sessionQueues.set(sessionId, queuedTurn);
      await prevTurn;

      let chainSeen = this.chainFiredTriggers.get(chainId);
      if (!chainSeen) {
        chainSeen = new Set();
        this.chainFiredTriggers.set(chainId, chainSeen);
        while (this.chainFiredTriggers.size > MAX_TRACKED_CHAINS) {
          const oldest = this.chainFiredTriggers.keys().next().value;
          if (oldest === undefined) break;
          this.chainFiredTriggers.delete(oldest);
        }
      }
      chainSeen.add(entry.id);

      await this.deps.session.sendMessage(
        sessionId,
        resolvedMessage,
        (event) => {
          if (event.type !== "agent_end") return;
          agentEnded = true;
          turnError = readTurnError(event);
        },
        { source: "triggered", triggerName, triggerDepth: depth + 1, triggerChainId: chainId },
      );

      if (turnError !== undefined) {
        throw new Error(turnError);
      }

      if (agentEnded) {
        this.deps.getTriggerStore(agentId)?.appendLog({
          ...logEntry,
          completedAt: Date.now(),
          status: "success",
        });
        this.emit("trigger_completed", {
          agentId,
          triggerId: entry.id,
          sessionId,
          status: "success",
        });
      }
    } catch (err) {
      const busy =
        err instanceof ValidationError && err.message.includes("turn in progress") && sessionId !== "";
      if (busy && (opts?.deferredAttempts ?? 0) < 1) {
        this.deferUntilTurnEnd(entry, agentId, agentName, payload, eventName, opts, sessionId, logEntry);
        return;
      }
      const skipped =
        err instanceof ValidationError && err.message.includes("turn in progress");
      const error = skipped
        ? `session busy (turn in progress), skipped: ${String(err)}`
        : String(err);
      if (skipped) {
        this.logger.warn({ agentId, triggerId: entry.id, sessionId }, "trigger skipped: target session busy");
      }
      this.deps.getTriggerStore(agentId)?.appendLog({
        ...logEntry,
        completedAt: Date.now(),
        status: "failed",
        error,
      });
      this.emit("trigger_failed", {
        agentId,
        triggerId: entry.id,
        error,
      });
    } finally {
      releaseQueue();
      if (queuedTurn !== undefined && this.sessionQueues.get(sessionId) === queuedTurn) {
        this.sessionQueues.delete(sessionId);
      }
      this.inProgress.delete(entry.id);
    }
  }
}
