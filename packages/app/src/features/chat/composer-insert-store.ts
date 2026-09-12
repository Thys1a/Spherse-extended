import { create } from "zustand";

interface ComposerInsertState {
  sessionId: string | null;
  text: string;
  nonce: number;
  requestInsert: (sessionId: string, text: string) => void;
  consume: (nonce: number) => void;
}

export const useComposerInsertStore = create<ComposerInsertState>((set) => ({
  sessionId: null,
  text: "",
  nonce: 0,
  requestInsert: (sessionId, text) =>
    set((state) => ({ sessionId, text, nonce: state.nonce + 1 })),
  consume: (nonce) =>
    set((state) =>
      state.nonce === nonce ? { sessionId: null, text: "" } : state,
    ),
}));
