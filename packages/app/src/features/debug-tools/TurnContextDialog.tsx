import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRightIcon, DownloadIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useI18n } from "@spherse/i18n/react";
import { toast } from "sonner";
import type { DebugSessionEventContract, TurnContextSnapshotContract } from "@spherse/contracts";
import type { ApiClient } from "../../lib/api";
import { ensureProjectSession } from "../../queries/project";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import { Input } from "../../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { EventLogRow } from "./EventLogRow";

interface TurnContextDialogProps {
  projectId: string;
  client: ApiClient | null;
  sessionId: string;
  onClose: () => void;
}

function messageRole(message: unknown): string {
  if (typeof message === "object" && message !== null) {
    const role = (message as { role?: unknown }).role;
    if (typeof role === "string" && role) return role;
  }
  return "message";
}

function messagePreview(message: unknown): string {
  const content =
    typeof message === "object" && message !== null
      ? (message as { content?: unknown }).content
      : undefined;
  const text = typeof content === "string" ? content : JSON.stringify(content ?? message);
  return (text ?? "").slice(0, 160);
}

function SnapshotRow({ title, body }: { title: React.ReactNode; body: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border-b border-border last:border-b-0">
        <CollapsibleTrigger className="group flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-start hover:bg-muted/50">
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{title}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mx-2 mb-2 max-h-64 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs">
            {body}
          </pre>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function TurnContextDialog({ projectId, client, sessionId, onClose }: TurnContextDialogProps) {
  const { t } = useI18n();
  const [events, setEvents] = useState<DebugSessionEventContract[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [query, setQuery] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [snapshot, setSnapshot] = useState<TurnContextSnapshotContract | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotFailed, setSnapshotFailed] = useState(false);
  const hasDataRef = useRef(false);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    if (!client) {
      setLoading(false);
      setLoadFailed(true);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    ensureProjectSession(projectId, client, sessionId)
      .then(async (session) => {
        if (!session) throw new Error("session not found");
        const log = await client.getSessionEvents(session.agentId, sessionId);
        if (cancelled) return;
        hasDataRef.current = true;
        setEvents(log.events);
      })
      .catch(() => {
        if (cancelled) return;
        if (hasDataRef.current) {
          toast.error(tRef.current("debug.eventLogLoadFailed"));
        } else {
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, projectId, sessionId, reloadToken]);

  useEffect(() => {
    let cancelled = false;
    if (!client) return;
    setSnapshotLoading(true);
    setSnapshotFailed(false);
    client
      .getTurnContext(sessionId)
      .then((data) => {
        if (cancelled) return;
        setSnapshot(data);
      })
      .catch(() => {
        if (cancelled) return;
        setSnapshotFailed(true);
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, sessionId, reloadToken]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!events) return [];
    if (!q) return events;
    return events.filter((event) => event.type.toLowerCase().includes(q));
  }, [events, query]);

  const handleDownload = async () => {
    if (!client) return;
    setDownloading(true);
    try {
      const data = await client.getTurnContext(sessionId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      document.body.appendChild(Object.assign(document.createElement("a"), { href: url }));
      const a = document.body.lastChild as HTMLAnchorElement;
      a.download = `turn-context-${sessionId.slice(0, 8)}-${Date.now()}.json`;
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("debug.downloadTurnContextFailed"));
    } finally {
      setDownloading(false);
    }
  };

  const params: Array<{ label: string; value: string }> = snapshot
    ? [
        { label: t("debug.promptModel"), value: snapshot.model ?? "—" },
        { label: t("debug.promptThinking"), value: snapshot.thinkingLevel ?? "—" },
        {
          label: t("debug.promptTemperature"),
          value: snapshot.sampling?.temperature !== undefined ? String(snapshot.sampling.temperature) : "—",
        },
        {
          label: t("debug.promptTopP"),
          value: snapshot.sampling?.topP !== undefined ? String(snapshot.sampling.topP) : "—",
        },
        {
          label: t("debug.promptTokens"),
          value: snapshot.currentTokens !== undefined ? String(snapshot.currentTokens) : "—",
        },
        { label: t("debug.promptCapturedAt"), value: snapshot.capturedAt },
      ]
    : [];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex h-[85vh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader className="flex-row items-center justify-between gap-2 pe-8">
          <DialogTitle>{t("debug.turnContext")}</DialogTitle>
          <Button size="sm" onClick={handleDownload} disabled={downloading}>
            <DownloadIcon />
            {t("debug.downloadTurnContext")}
          </Button>
        </DialogHeader>
        {snapshot ? (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {params.map((p) => (
                <span key={p.label}>
                  {p.label}: <span className="font-mono text-foreground">{p.value}</span>
                </span>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("debug.promptFoldNote")}</p>
          </div>
        ) : null}
        <Tabs defaultValue="events" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="events">{t("debug.promptTabEvents")}</TabsTrigger>
            <TabsTrigger value="system">{t("debug.promptTabSystem")}</TabsTrigger>
            <TabsTrigger value="messages">{t("debug.promptTabMessages")}</TabsTrigger>
            <TabsTrigger value="tools">{t("debug.promptTabTools")}</TabsTrigger>
          </TabsList>
          <TabsContent value="events" className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("debug.eventLogSearchPlaceholder")}
                  className="ps-8"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                title={t("debug.eventLogRefresh")}
                disabled={loading}
                onClick={() => setReloadToken((n) => n + 1)}
              >
                <RefreshCwIcon />
              </Button>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {t("debug.eventLogCount", { count: filtered.length })}
              </span>
            </div>
            <div className="flex-1 overflow-auto rounded-md border border-border">
              {loading ? (
                <div className="p-4 text-xs text-muted-foreground">{t("common.loading")}</div>
              ) : loadFailed && !events ? (
                <div className="flex flex-col items-center gap-2 p-4 text-xs text-muted-foreground">
                  {t("debug.eventLogLoadFailed")}
                  <Button variant="outline" size="sm" onClick={() => setReloadToken((n) => n + 1)}>
                    {t("debug.eventLogRefresh")}
                  </Button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">{t("debug.eventLogEmpty")}</div>
              ) : (
                filtered.map((event) => <EventLogRow key={event.seq} event={event} />)
              )}
            </div>
          </TabsContent>
          <TabsContent value="system" className="min-h-0 flex-1 overflow-auto">
            <SnapshotBody
              loading={snapshotLoading}
              failed={snapshotFailed}
              onRetry={() => setReloadToken((n) => n + 1)}
              emptyText={t("debug.promptSnapshotFailed")}
              retryText={t("debug.eventLogRefresh")}
            >
              <pre className="whitespace-pre-wrap break-words rounded-md border border-border p-3 font-mono text-xs">
                {snapshot?.systemPrompt ?? ""}
              </pre>
            </SnapshotBody>
          </TabsContent>
          <TabsContent value="messages" className="min-h-0 flex-1 overflow-auto">
            <SnapshotBody
              loading={snapshotLoading}
              failed={snapshotFailed}
              onRetry={() => setReloadToken((n) => n + 1)}
              emptyText={t("debug.promptSnapshotFailed")}
              retryText={t("debug.eventLogRefresh")}
            >
              <div className="rounded-md border border-border">
                {(snapshot?.messages ?? []).map((message, index) => (
                  <SnapshotRow
                    key={index}
                    title={
                      <>
                        <Badge variant="secondary">{messageRole(message)}</Badge>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {messagePreview(message)}
                        </span>
                      </>
                    }
                    body={JSON.stringify(message, null, 2)}
                  />
                ))}
              </div>
            </SnapshotBody>
          </TabsContent>
          <TabsContent value="tools" className="min-h-0 flex-1 overflow-auto">
            <SnapshotBody
              loading={snapshotLoading}
              failed={snapshotFailed}
              onRetry={() => setReloadToken((n) => n + 1)}
              emptyText={t("debug.promptSnapshotFailed")}
              retryText={t("debug.eventLogRefresh")}
            >
              <div className="rounded-md border border-border">
                {(snapshot?.tools ?? []).map((tool) => (
                  <SnapshotRow
                    key={tool.name}
                    title={
                      <>
                        <span className="font-mono text-xs text-foreground">{tool.name}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {tool.description}
                        </span>
                      </>
                    }
                    body={JSON.stringify(tool.parameters, null, 2)}
                  />
                ))}
              </div>
            </SnapshotBody>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SnapshotBody({
  loading,
  failed,
  onRetry,
  emptyText,
  retryText,
  children,
}: {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  emptyText: string;
  retryText: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return <div className="p-4 text-xs text-muted-foreground">{`${emptyText}…`}</div>;
  }
  if (failed) {
    return (
      <div className="flex flex-col items-center gap-2 p-4 text-xs text-muted-foreground">
        {emptyText}
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryText}
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
