import { create } from "zustand";

export interface SplitState {
  filePath: string;
  ratio: number;
}

interface SplitStore {
  byProject: Record<string, SplitState | undefined>;
  openSplit: (projectId: string, filePath: string) => void;
  setFile: (projectId: string, filePath: string) => void;
  closeSplit: (projectId: string) => void;
  closeDeletedSplit: (projectId: string, path: string) => void;
  setRatio: (projectId: string, ratio: number) => void;
  clearProject: (projectId: string) => void;
}

export const SPLIT_MIN_RATIO = 0.2;
export const SPLIT_MAX_RATIO = 0.8;
const DEFAULT_RATIO = 0.5;
const SPLIT_MIN_MAIN_WIDTH = 400;
const SPLIT_MIN_PANE_WIDTH = 320;
const STORAGE_KEY = "spherse:split";

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_RATIO;
  return Math.min(SPLIT_MAX_RATIO, Math.max(SPLIT_MIN_RATIO, ratio));
}

export function clampRatioForWidth(ratio: number, containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return clampRatio(ratio);
  if (containerWidth < SPLIT_MIN_MAIN_WIDTH + SPLIT_MIN_PANE_WIDTH) return DEFAULT_RATIO;
  return clampRatio(ratio);
}

function isValidSplitState(value: unknown): value is SplitState {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return typeof o.filePath === "string" && o.filePath.length > 0 && typeof o.ratio === "number";
}

function loadFromStorage(): Record<string, SplitState | undefined> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const byProject: Record<string, SplitState | undefined> = {};
    for (const [projectId, entry] of Object.entries(parsed)) {
      if (!isValidSplitState(entry)) continue;
      byProject[projectId] = { filePath: entry.filePath, ratio: clampRatio(entry.ratio) };
    }
    return byProject;
  } catch {
    return {};
  }
}

function persist(byProject: Record<string, SplitState | undefined>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(byProject));
  } catch {
    return;
  }
}

export const useSplitStore = create<SplitStore>((set) => ({
  byProject: loadFromStorage(),

  openSplit(projectId, filePath) {
    if (!filePath) return;
    set((s) => {
      const existing = s.byProject[projectId];
      if (existing?.filePath === filePath) return s;
      const byProject = {
        ...s.byProject,
        [projectId]: { filePath, ratio: existing?.ratio ?? DEFAULT_RATIO },
      };
      persist(byProject);
      return { byProject };
    });
  },

  setFile(projectId, filePath) {
    if (!filePath) return;
    set((s) => {
      const existing = s.byProject[projectId];
      if (!existing) return s;
      if (existing.filePath === filePath) return s;
      const byProject = { ...s.byProject, [projectId]: { ...existing, filePath } };
      persist(byProject);
      return { byProject };
    });
  },

  closeSplit(projectId) {
    set((s) => {
      if (!s.byProject[projectId]) return s;
      const byProject = { ...s.byProject };
      delete byProject[projectId];
      persist(byProject);
      return { byProject };
    });
  },

  closeDeletedSplit(projectId, path) {
    set((s) => {
      const filePath = s.byProject[projectId]?.filePath;
      if (!filePath || (filePath !== path && !filePath.startsWith(`${path}/`))) return s;
      const byProject = { ...s.byProject };
      delete byProject[projectId];
      persist(byProject);
      return { byProject };
    });
  },

  setRatio(projectId, ratio) {
    set((s) => {
      const existing = s.byProject[projectId];
      if (!existing) return s;
      const clamped = clampRatio(ratio);
      if (existing.ratio === clamped) return s;
      const byProject = { ...s.byProject, [projectId]: { ...existing, ratio: clamped } };
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
