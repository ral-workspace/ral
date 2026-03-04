import { create } from "zustand";

export interface DiffData {
  path: string;
  oldText: string;
  newText: string;
}

interface DiffState {
  diffs: Map<string, DiffData>;
  setDiff: (tabId: string, data: DiffData) => void;
  removeDiff: (tabId: string) => void;
}

export const useDiffStore = create<DiffState>((set, get) => ({
  diffs: new Map(),

  setDiff: (tabId, data) => {
    const next = new Map(get().diffs);
    next.set(tabId, data);
    set({ diffs: next });
  },

  removeDiff: (tabId) => {
    const next = new Map(get().diffs);
    next.delete(tabId);
    set({ diffs: next });
  },
}));
