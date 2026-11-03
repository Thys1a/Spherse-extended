import { create } from "zustand";

interface DetachedFloatStore {
  keys: Set<string>;
  hydrate: (keys: string[]) => void;
  add: (key: string) => void;
  remove: (key: string) => void;
  clearProject: (projectId: string) => void;
}

export const useDetachedFloatStore = create<DetachedFloatStore>((set) => ({
  keys: new Set(),

  hydrate(keys) {
    set({ keys: new Set(keys) });
  },

  add(key) {
    set((s) => {
      if (s.keys.has(key)) return s;
      const next = new Set(s.keys);
      next.add(key);
      return { keys: next };
    });
  },

  remove(key) {
    set((s) => {
      if (!s.keys.has(key)) return s;
      const next = new Set(s.keys);
      next.delete(key);
      return { keys: next };
    });
  },

  clearProject(projectId) {
    set((s) => {
      let changed = false;
      const next = new Set(s.keys);
      for (const key of next) {
        if (key.startsWith(`chat:${projectId}:`) || key.startsWith(`content:${projectId}:`)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? { keys: next } : s;
    });
  },
}));
