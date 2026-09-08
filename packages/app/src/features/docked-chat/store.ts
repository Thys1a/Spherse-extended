import { create } from "zustand";

export interface DockSlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DockedChatEntry {
  dockId: number;
  sessionId: string;
  slotRect: DockSlotRect | null;
  iframe: HTMLIFrameElement;
}

interface DockedChatStore {
  entries: ReadonlyMap<MessageEventSource, DockedChatEntry>;
  dock: (source: MessageEventSource, sessionId: string, iframe: HTMLIFrameElement) => void;
  setSlotRect: (source: MessageEventSource, slotRect: DockSlotRect) => void;
  undock: (source: MessageEventSource) => void;
}

let nextDockId = 1;

export const useDockedChatStore = create<DockedChatStore>((set) => ({
  entries: new Map<MessageEventSource, DockedChatEntry>(),

  dock(source, sessionId, iframe) {
    set((s) => {
      const next = new Map(s.entries);
      const existing = next.get(source);
      if (existing && existing.sessionId === sessionId) {
        next.set(source, { ...existing, iframe });
        return { entries: next };
      }
      next.set(source, { dockId: nextDockId++, sessionId, slotRect: null, iframe });
      return { entries: next };
    });
  },

  setSlotRect(source, slotRect) {
    set((s) => {
      const current = s.entries.get(source);
      if (!current) return s;
      const prev = current.slotRect;
      if (
        prev
        && prev.x === slotRect.x
        && prev.y === slotRect.y
        && prev.width === slotRect.width
        && prev.height === slotRect.height
      ) {
        return s;
      }
      const next = new Map(s.entries);
      next.set(source, { ...current, slotRect });
      return { entries: next };
    });
  },

  undock(source) {
    set((s) => {
      if (!s.entries.has(source)) return s;
      const next = new Map(s.entries);
      next.delete(source);
      return { entries: next };
    });
  },
}));