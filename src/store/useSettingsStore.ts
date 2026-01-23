import { create } from "zustand";
import { Settings, UpdateSettings } from "../config/settings";
import type { Model } from "../types/Model";

interface SettingsState {
  ollamaUrl: string;
  primaryModel: string;
  secondaryModel: string;
  models: Model[];
  history: string[];
  groq_api_key: string;
  openrouter_api_key: string;
  // Actions
  setOllamaUrl: (url: string) => void;
  syncWithSettings: () => void;
}

const DEFAULTS = {
  ollamaUrl: "http://localhost:11434",
  primaryModel: "qwen3:8b|ollama",
  secondaryModel: "llama3.1:latest|ollama",
  models: [] as Model[],
  history: [] as string[],
  groq_api_key: "",
  openrouter_api_key: "",
};

const useSettingsStore = create<SettingsState>()((set) => {
  return {
    ...DEFAULTS,

    setOllamaUrl: (url) => {
      try {
        UpdateSettings({ ollamaUrl: url });
      } catch (e) {
        console.error("Failed to save setting ollamaUrl:", e);
      }
      set({ ollamaUrl: url });
    },

    syncWithSettings: () => {
      try {
        const settings = Settings.getInstance();
        set({
          ollamaUrl: settings.get("ollamaUrl"),
          primaryModel: settings.get("primaryModel"),
          secondaryModel: settings.get("secondaryModel"),
          models: settings.get("models"),
          history: settings.get("history"),
          groq_api_key: settings.get("groq_api_key"),
          openrouter_api_key: settings.get("openrouter_api_key"),
        });
      } catch (e) {
        console.error("Failed to sync settings:", e);
      }
    },
  };
});

export default useSettingsStore;
