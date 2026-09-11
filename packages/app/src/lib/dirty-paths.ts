import { create } from "zustand";

interface DirtyPathsStore {
  byProject: Record<string, Record<string, string[]>>;
  setDirty: (projectId: string, filePath: string, instanceId: string, dirty: boolean) => void;
  isDirty: (projectId: string, filePath: string) => boolean;
  isDirtyUnder: (projectId: string, prefix: string) => boolean;
  remapPaths: (projectId: string, oldPath: string, newPath: string) => void;
  removePath: (projectId: string, path: string) => void;
  clearProject: (projectId: string) => void;
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export const useDirtyPathsStore = create<DirtyPathsStore>((set, get) => ({
  byProject: {},

  setDirty(projectId, filePath, instanceId, dirty) {
    set((s) => {
      const project = s.byProject[projectId] ?? {};
      const ids = project[filePath] ?? [];
      const has = ids.includes(instanceId);
      if (dirty === has) return s;
      const nextIds = dirty ? [...ids, instanceId] : ids.filter((id) => id !== instanceId);
      const nextProject = { ...project };
      if (nextIds.length === 0) {
        delete nextProject[filePath];
      } else {
        nextProject[filePath] = nextIds;
      }
      return { byProject: { ...s.byProject, [projectId]: nextProject } };
    });
  },

  isDirty(projectId, filePath) {
    return (get().byProject[projectId]?.[filePath]?.length ?? 0) > 0;
  },

  isDirtyUnder(projectId, prefix) {
    const project = get().byProject[projectId] ?? {};
    return Object.keys(project).some((p) => matchesPrefix(p, prefix));
  },

  remapPaths(projectId, oldPath, newPath) {
    set((s) => {
      const project = s.byProject[projectId];
      if (!project) return s;
      let changed = false;
      const nextProject: Record<string, string[]> = {};
      for (const [p, ids] of Object.entries(project)) {
        if (!matchesPrefix(p, oldPath)) {
          nextProject[p] = ids;
          continue;
        }
        changed = true;
        const remapped = p === oldPath ? newPath : newPath + p.slice(oldPath.length);
        nextProject[remapped] = [...(nextProject[remapped] ?? []), ...ids];
      }
      if (!changed) return s;
      return { byProject: { ...s.byProject, [projectId]: nextProject } };
    });
  },

  removePath(projectId, path) {
    set((s) => {
      const project = s.byProject[projectId];
      if (!project) return s;
      let changed = false;
      const nextProject: Record<string, string[]> = {};
      for (const [p, ids] of Object.entries(project)) {
        if (matchesPrefix(p, path)) {
          changed = true;
          continue;
        }
        nextProject[p] = ids;
      }
      if (!changed) return s;
      return { byProject: { ...s.byProject, [projectId]: nextProject } };
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
