import { UpdateSettings } from "@/config/settings";
import useSettingsStore from "../store/useSettingsStore";
import type { Model } from "../types/Model";

const getSettings = () => useSettingsStore.getState();

interface CerebrasModelsResponse {
  object: string;
  data: CerebrasModel[];
}

interface CerebrasModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

class CerebrasClient {
  async syncCerebrasModels() {
    if (!getSettings().cerebras_api_key) {
      return;
    }
    const url = `https://api.cerebras.ai/v1/models`;
    const options = {
      method: "GET",
      headers: { Authorization: `Bearer ${getSettings().cerebras_api_key}` },
    };
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Failed to fetch Cerebras models ${response.status}`);
    }
    const data = (await response.json()) as CerebrasModelsResponse;
    const savedModels = getSettings().models;
    const nonCerebrasModels = savedModels.filter((m) => m.type !== "cerebras");
    const models: Model[] = data.data.map(
      (model) =>
        ({
          type: "cerebras",
          name: model.id,
          modified_at: new Date(model.created * 1000).toISOString(),
          digest: "",
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
          details: {
            provider: "cerebras",
          },
        }) as Model,
    );
    const updatedModels = [];
    for (const model of models) {
      const existingModel = nonCerebrasModels.find(
        (m) => m.name === model.name,
      );
      if (existingModel) {
        updatedModels.push({ ...existingModel, ...model });
      } else {
        updatedModels.push(model);
      }
    }
    const mergedModels = [...nonCerebrasModels, ...updatedModels];
    await UpdateSettings({ models: mergedModels });
  }
}

export default new CerebrasClient();
