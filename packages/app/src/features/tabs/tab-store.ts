import { create } from "zustand";

export type TabKind = "chat" | "content" | "browser" | "home";

export interface Tab {
  id: string;
  kind: TabKind;
  projectId: string;
  label: string;
  sessionId?: string;
  filePath?: string;
  url?: string;
}

export interface OpenTabSpec {
  kind: TabKind;
  label: string;
  sessionId?: string;
  filePath?: string;
  url?: string;
}

interface ProjectTabs {
  tabs: Tab[];
  activeTabId: string | null;
}

interface TabStore {
  byProject: Record<string, ProjectTabs>;
  openTab: (projectId: string, spec: OpenTabSpec) => string;
  closeTab: (projectId: string, id: string) => void;
  activate: (projectId: string, id: string) => void;
  reorder: (projectId: string, from: number, to: number) => void;
  clearProject: (projectId: string) => void;
}

const STORAGE_KEY = "spherse:tabs";

function identityOf(spec: OpenTabSpec): string | undefined {
  if (spec.kind === "chat") return spec.sessionId ? `chat:${spec.sessionId}` : undefined;
  if (spec.kind === "content") return spec.filePath ? `content:${spec.filePath}` : undefined;
  if (spec.kind === "browser") return spec.url ? `browser:${spec.url}` : undefined;
  return "home";
}

function identityOfTab(tab: Tab): string | undefined {
  return identityOf(tab);
}

function loadFromStorage(): Record<string, ProjectTabs> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ProjectTabs>;
    if (!parsed || typeof parsed !== "object") return {};
    for (const [projectId, entry] of Object.entries(parsed)) {
      if (!entry || !Array.isArray(entry.tabs)) {
        delete parsed[projectId];
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

function persist(byProject: Record<string, ProjectTabs>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(byProject));
  } catch {
    // storage full or unavailable — non-fatal
  }
}

function emptyProjectTabs(): ProjectTabs {
  return { tabs: [], activeTabId: null };
}

export const useTabStore = create<TabStore>((set, get) => ({
  byProject: loadFromStorage(),

  openTab(projectId, spec) {
    const identity = identityOf(spec);
    const existing = get().byProject[projectId];
    if (identity !== undefined && existing) {
      const match = existing.tabs.find((t) => identityOfTab(t) === identity);
      if (match) {
        if (spec.label && spec.label !== match.label) {
          set((s) => {
            const entry = s.byProject[projectId];
            if (!entry) return s;
            const byProject = {
              ...s.byProject,
              [projectId]: {
                ...entry,
                tabs: entry.tabs.map((t) => (t.id === match.id ? { ...t, label: spec.label } : t)),
                activeTabId: match.id,
              },
            };
            persist(byProject);
            return { byProject };
          });
        } else if (existing.activeTabId !== match.id) {
          set((s) => {
            const entry = s.byProject[projectId];
            if (!entry) return s;
            const byProject = { ...s.byProject, [projectId]: { ...entry, activeTabId: match.id } };
            persist(byProject);
            return { byProject };
          });
        }
        return match.id;
      }
    }
    const tab: Tab = {
      id: crypto.randomUUID(),
      kind: spec.kind,
      projectId,
      label: spec.label,
      sessionId: spec.sessionId,
      filePath: spec.filePath,
      url: spec.url,
    };
    set((s) => {
      const entry = s.byProject[projectId] ?? emptyProjectTabs();
      const byProject = {
        ...s.byProject,
        [projectId]: { tabs: [...entry.tabs, tab], activeTabId: tab.id },
      };
      persist(byProject);
      return { byProject };
    });
    return tab.id;
  },

  closeTab(projectId, id) {
    set((s) => {
      const entry = s.byProject[projectId];
      if (!entry) return s;
      const idx = entry.tabs.findIndex((t) => t.id === id);
      if (idx === -1) return s;
      let tabs = entry.tabs.filter((t) => t.id !== id);
      let activeTabId = entry.activeTabId;
      if (activeTabId === id) {
        activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null;
      }
      if (tabs.length === 0) {
        const home: Tab = { id: crypto.randomUUID(), kind: "home", projectId, label: "" };
        tabs = [home];
        activeTabId = home.id;
      }
      const byProject = { ...s.byProject, [projectId]: { tabs, activeTabId } };
      persist(byProject);
      return { byProject };
    });
  },

  activate(projectId, id) {
    set((s) => {
      const entry = s.byProject[projectId];
      if (!entry || !entry.tabs.some((t) => t.id === id)) return s;
      if (entry.activeTabId === id) return s;
      const byProject = { ...s.byProject, [projectId]: { ...entry, activeTabId: id } };
      persist(byProject);
      return { byProject };
    });
  },

  reorder(projectId, from, to) {
    set((s) => {
      const entry = s.byProject[projectId];
      if (!entry) return s;
      if (from < 0 || from >= entry.tabs.length || to < 0 || to >= entry.tabs.length) return s;
      if (from === to) return s;
      const tabs = [...entry.tabs];
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      const byProject = { ...s.byProject, [projectId]: { ...entry, tabs } };
      persist(byProject);
      return { byProject };
    });
  },

  clearProject(projectId) {
    set((s) => {
      if (!s.byProject[projectId]) return s;
      const { [projectId]: _removed, ...rest } = s.byProject;
      persist(rest);
      return { byProject: rest };
    });
  },
}));
