import { create } from "zustand";

interface HistoryState {
  history: string[];
  addToHistory: (query: string) => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  history: [],
  addToHistory: (query) => {
    if (!query.trim()) return;
    set((state) => {
      const newHistory = [
        query,
        ...state.history.filter((item) => item !== query),
      ].slice(0, 50);
      return { history: newHistory };
    });
  },
}));
