import { create } from "zustand";

interface UIState {
  executionMode: "Planning" | "Fast";
  setExecutionMode: (mode: "Planning" | "Fast") => void;
}

export const useUIStore = create<UIState>((set) => ({
  executionMode: "Fast",
  setExecutionMode: (mode) => set({ executionMode: mode }),
}));
