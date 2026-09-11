import { create } from "zustand";

interface DirtyPathsStore {
  byProject: Record<string, string[]>;
  setDirty: (projectId: string, filePath: string, dirty: boolean) => void;
  isDirty: (projectId: string, filePath: string) => boolean;
  isDirtyUnder: (projectId: string, prefix: string) => boolean;
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

  clearProject(projectId) {
    set((s) => {
      if (!s.byProject[projectId]) return s;
      const { [projectId]: _removed, ...rest } = s.byProject;
      return { byProject: rest };
    });
  },
}));
