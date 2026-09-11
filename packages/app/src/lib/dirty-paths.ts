import { create } from "zustand";

interface DirtyPathsStore {
  byProject: Record<string, string[]>;
  setDirty: (projectId: string, filePath: string, dirty: boolean) => void;
  isDirty: (projectId: string, filePath: string) => boolean;
  isDirtyUnder: (projectId: string, prefix: string) => boolean;
  remapPaths: (projectId: string, oldPath: string, newPath: string) => void;
  removePath: (projectId: string, path: string) => void;
  clearProject: (projectId: string) => void;
}

export const useDirtyPathsStore = create<DirtyPathsStore>((set, get) => ({
  byProject: {},

  setDirty(projectId, filePath, dirty) {
    set((s) => {
      const current = s.byProject[projectId] ?? [];
      const has = current.includes(filePath);
      if (dirty === has) return s;
      const byProject = {
        ...s.byProject,
        [projectId]: dirty ? [...current, filePath] : current.filter((p) => p !== filePath),
      };
      return { byProject };
    });
  },

  isDirty(projectId, filePath) {
    return (get().byProject[projectId] ?? []).includes(filePath);
  },

  isDirtyUnder(projectId, prefix) {
    const list = get().byProject[projectId] ?? [];
    return list.some((p) => p === prefix || p.startsWith(`${prefix}/`));
  },

  remapPaths(projectId, oldPath, newPath) {
    set((s) => {
      const current = s.byProject[projectId];
      if (!current || current.length === 0) return s;
      const prefix = `${oldPath}/`;
      let changed = false;
      const next = current.map((p) => {
        if (p !== oldPath && !p.startsWith(prefix)) return p;
        changed = true;
        return p === oldPath ? newPath : newPath + p.slice(oldPath.length);
      });
      if (!changed) return s;
      return { byProject: { ...s.byProject, [projectId]: next } };
    });
  },

  removePath(projectId, path) {
    set((s) => {
      const current = s.byProject[projectId];
      if (!current) return s;
      const prefix = `${path}/`;
      const next = current.filter((p) => p !== path && !p.startsWith(prefix));
      if (next.length === current.length) return s;
      return { byProject: { ...s.byProject, [projectId]: next } };
    });
  },

  clearProject(projectId) {
    set((s) => {
      if (!s.byProject[projectId]) return s;
      const { [projectId]: _removed, ...rest } = s.byProject;
      return { byProject: rest };
    });
  },
}));
