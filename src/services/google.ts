import { UpdateSettings } from "@/config/settings";
import useSettingsStore from "../store/useSettingsStore";
import type { Model } from "../types/Model";

const getSettings = () => useSettingsStore.getState();

class GoogleClient {
  async syncGoogleModels() {
    if (!getSettings().google_api_key) {
      return;
    }
    const savedModels = getSettings().models;
    const nonGoogleModels = savedModels.filter((m) => m.type !== "google");
    const models: Model[] = [
      {
        type: "google",
        name: "gemini-3-flash-preview",
        modified_at: new Date().toISOString(),
        digest: "",
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        details: {
          provider: "google",
          context_length: 100000,
        },
      } as Model,
      {
        type: "google",
        name: "gemini-2.5-flash-lite",
        modified_at: new Date().toISOString(),
        digest: "",
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        details: {
          provider: "google",
          context_length: 100000,
        },
      } as Model,
    ];
    const updatedModels = [];
    for (const model of models) {
      const existingModel = nonGoogleModels.find((m) => m.name === model.name);
      if (existingModel) {
        updatedModels.push({ ...existingModel, ...model });
      } else {
        updatedModels.push(model);
      }
    }
    const mergedModels = [...nonGoogleModels, ...updatedModels];
    await UpdateSettings({ models: mergedModels });
  }
}

export default new GoogleClient();
