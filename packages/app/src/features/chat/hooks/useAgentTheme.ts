import { useState, useEffect, useRef, useCallback } from "react";
import type { ApiClient } from "../../../lib/api";
import { useBusSubscription } from "../../../hooks/useBusSubscription";
import { useReconnectedSync } from "../../../hooks/useReconnectedSync";

const GLOBAL_AT_RULES = new Set([
  "font-face",
  "keyframes",
  "import",
  "charset",
  "namespace",
  "scope",
]);

function splitTopLevel(css: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let inComment = false;
  let inString: string | null = null;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    const next = css[i + 1];
    if (inComment) {
      if (ch === "*" && next === "/") {
        inComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "/" && next === "*") {
      inComment = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0) {
          parts.push(css.slice(start, i + 1));
          start = i + 1;
        }
      } else {
        start = i + 1;
      }
    }
    if (ch === ";" && depth === 0) {
      parts.push(css.slice(start, i + 1));
      start = i + 1;
    }
  }
  const tail = css.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function splitSelectors(selectorText: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let inString: string | null = null;
  for (let i = 0; i < selectorText.length; i++) {
    const ch = selectorText[i];
    if (inString) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(selectorText.slice(start, i));
      start = i + 1;
    }
  }
  out.push(selectorText.slice(start));
  return out;
}

function scopeSelector(selector: string, scope: string): string {
  const trimmed = selector.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("&")) return scope + trimmed.slice(1);
  if (trimmed.startsWith("[data-chat-root]")) {
    return `[data-chat-root]${scope}${trimmed.slice("[data-chat-root]".length)}`;
  }
  if (trimmed.startsWith("[data-chat-float-root]")) {
    return trimmed;
  }
  const rootMatch = /^(:(root)|html|body)(?=[\s:.,[#>+~]|$)/.exec(trimmed);
  if (rootMatch) return scope + trimmed.slice(rootMatch[0].length);
  return `${scope} ${trimmed}`;
}

function scopeRuleBlock(block: string, scope: string): string {
  const brace = block.indexOf("{");
  if (brace === -1) return block;
  const selectorText = block.slice(0, brace).trim();
  const body = block.slice(brace);
  if (!selectorText.startsWith("@")) {
    const scoped = splitSelectors(selectorText)
      .map((s) => scopeSelector(s, scope))
      .join(", ");
    return `${scoped} ${body}`;
  }
  const nameMatch = /^@([a-z-]+)/i.exec(selectorText);
  const name = nameMatch?.[1].toLowerCase() ?? "";
  if (GLOBAL_AT_RULES.has(name)) return block;
  const bodyEnd = body.lastIndexOf("}");
  if (bodyEnd === -1) return block;
  const inner = body.slice(1, bodyEnd);
  const scopedInner = splitTopLevel(inner)
    .map((part) => scopeRuleBlock(part, scope))
    .join("\n");
  return `${selectorText} {\n${scopedInner}\n}`;
}

export function scopeAgentThemeCss(css: string, instanceId: string): string {
  const scope = `[data-chat-instance="${instanceId.replace(/["\\]/g, "\\$&")}"]`;
  return splitTopLevel(css)
    .map((part) => scopeRuleBlock(part, scope))
    .join("\n")
    .replace(/<\/style/gi, "<\\/style");
}

export function useAgentTheme(
  client: ApiClient | undefined,
  agentId: string | undefined,
  slug: string | undefined,
  projectId: string | undefined,
): string {
  const [css, setCss] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentIdRef = useRef(agentId);
  useEffect(() => {
    agentIdRef.current = agentId;
  });

  const loadTheme = useCallback(
    (id: string) => {
      if (!client) return;
      void client
        .getAgentTheme(id)
        .then((text) => {
          if (agentIdRef.current === id) setCss(text.trim());
        })
        .catch(() => {
          if (agentIdRef.current === id) setCss("");
        });
    },
    [client],
  );

  useEffect(() => {
    if (!client || !agentId) {
      setCss("");
      return;
    }
    loadTheme(agentId);
  }, [client, agentId, slug, loadTheme]);

  useBusSubscription(projectId ?? "", "fs-watch", (_type, payload) => {
    if (!client || !agentId || !slug) return;
    const changedPath = (payload as { path?: string } | null)?.path?.replace(/\\/g, "/");
    if (!changedPath || !changedPath.endsWith(`agents/${slug}/theme.css`)) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    const watchedId = agentId;
    timerRef.current = setTimeout(() => {
      loadTheme(watchedId);
    }, 250);
  });

  useReconnectedSync(() => {
    if (!client || !agentId || !slug) return;
    loadTheme(agentId);
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return css;
}
