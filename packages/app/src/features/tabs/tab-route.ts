import type { OpenTabSpec, Tab } from "./tab-store";
import { isLoopbackUrl } from "../browser/open-external-url";

export function tabToRoute(tab: Tab): string {
  if (tab.kind === "chat") return `/project/${tab.projectId}/chat/${encodeURIComponent(tab.sessionId ?? "")}`;
  if (tab.kind === "content") return `/project/${tab.projectId}/content?path=${encodeURIComponent(tab.filePath ?? "")}`;
  if (tab.kind === "browser") return `/project/${tab.projectId}/browser?url=${encodeURIComponent(tab.url ?? "")}`;
  return `/project/${tab.projectId}`;
}

export function routeToTabSpec(projectId: string, pathname: string, search: string): OpenTabSpec | null {
  const prefix = `/project/${projectId}`;
  if (pathname === prefix) return { kind: "home", label: "" };
  if (!pathname.startsWith(`${prefix}/`)) return null;
  const rest = pathname.slice(prefix.length + 1);
  if (rest.startsWith("chat/")) {
    let sessionId: string;
    try {
      sessionId = decodeURIComponent(rest.slice("chat/".length));
    } catch {
      return null;
    }
    if (!sessionId || sessionId.includes("/")) return null;
    return { kind: "chat", label: sessionId, sessionId };
  }
  if (rest === "content") {
    const filePath = new URLSearchParams(search).get("path");
    if (!filePath) return null;
    return { kind: "content", label: filePath.split("/").pop() ?? filePath, filePath };
  }
  if (rest === "browser") {
    const url = new URLSearchParams(search).get("url");
    if (!url || !isLoopbackUrl(url)) return null;
    return { kind: "browser", label: url, url };
  }
  return null;
}
