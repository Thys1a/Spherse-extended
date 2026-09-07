import { create } from "zustand";

export type TtsStatus = "idle" | "speaking";

interface TtsState {
  messageId: string | null;
  status: TtsStatus;
  start: (messageId: string) => void;
  stop: () => void;
}

export const useTtsStore = create<TtsState>((set) => ({
  messageId: null,
  status: "idle",
  start: (messageId) => set({ messageId, status: "speaking" }),
  stop: () => set({ messageId: null, status: "idle" }),
}));
