import { ChatOllama } from "@langchain/ollama";
import { Settings, UpdateSettings, type Model } from "../utils/Settings";
export type OllamaModel = Model;
import { useSettingsStore } from "../store/settingsStore";

// Helper to get state non-reactively (outside components)
const getSettings = () => useSettingsStore.getState();

export const getThinkerModel = () => {
  const { thinkerModel, ollamaUrl } = getSettings();
  return new ChatOllama({
    model: thinkerModel,
    baseUrl: ollamaUrl,
    temperature: 0,
  });
};

export const getGeneralModel = () => {
  const { generalModel, ollamaUrl } = getSettings();
  return new ChatOllama({
    model: generalModel,
    baseUrl: ollamaUrl,
    temperature: 0,
  });
};

export const getScoutModel = () => {
  const { scoutModel, ollamaUrl } = getSettings();
  return new ChatOllama({
    model: scoutModel,
    baseUrl: ollamaUrl,
    temperature: 0,
  });
};

export const isOllamaHealthy = async (): Promise<boolean> => {
  try {
    const { ollamaUrl } = getSettings();
    const response = await fetch(ollamaUrl);
    const text = await response.text();
    return response.ok && text === "Ollama is running";
  } catch {
    return false;
  }
};

export const getOllamaModels = async (): Promise<Model[]> => {
  const { ollamaUrl } = getSettings();
  const response = await fetch(`${ollamaUrl}/api/tags`);
  if (!response.ok) {
    throw new Error(`Error connecting to Ollama: ${response.status}`);
  }
  const data: any = await response.json();

  // Return the raw list, we'll validate/conform to schema later or rely on the basic shape
  // API returns { models: [...] }
  return data.models as Model[];
};

export const getOllamaModelDetails = async (model: string): Promise<any> => {
  const { ollamaUrl } = getSettings();
  const response = await fetch(`${ollamaUrl}/api/show`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model }),
  });
  if (!response.ok) {
    throw new Error(`Error connecting to Ollama: ${response.status}`);
  }
  const data: any = await response.json();
  return data;
};

export const syncOllamaModels = async () => {
  try {
    const settings = Settings.getInstance();
    const savedModels = settings.get("models") || [];
    const availableModels = await getOllamaModels();

    const mergedModels: Model[] = [];

    for (const model of availableModels) {
      const existing = savedModels.find((m) => m.name === model.name);

      // If we have it and it has the extra details we need (like capability/context), keep it.
      // But user said: "if it isnt saved, get the extra details for it"
      // Also check if we need to update details?
      // The user wants context_length.
      if (existing && existing.details?.context_length) {
        // Also update capabilities if missing?
        // Assuming existing is good if it has context_length
        mergedModels.push(existing);
        continue;
      }

      // Fetch details
      try {
        const details = await getOllamaModelDetails(model.name);

        // Extract context_length
        // User said: model_info.{model_info.general.architecture}.context_length
        // Note: The structure described "model_info.{model_info.general.architecture}.context_length" seems to imply
        // data.model_info[data.model_info.general.architecture].context_length

        let context_length: number | undefined;
        if (details.model_info && details.model_info["general.architecture"]) {
          const arch = details.model_info["general.architecture"];
          if (details.model_info[`${arch}.context_length`]) {
            context_length = details.model_info[`${arch}.context_length`];
          }
        }

        // capabilities seems to be at top level of getOllamaModelDetails response?
        // User said: "getOllamaModelDetails also has the property 'capabilities'"
        // But getOllamaModels might also have it?
        // "getOllamaModels also has the property 'capabilities', which returns an array of the model's capabilities"
        // Wait, did the user mean getOllamaModels (plural) or details?
        // "getOllamaModelDetails also has the property 'capabilities'" -> likely details response.

        // Actually, let's look at the user request carefully:
        // "getOllamaModelDetails has contextLength... getOllamaModelDetails also has the property 'capabilities'"

        // So we extract capabilities from details.

        const enhancedModel: Model = {
          ...model,
          capabilities: details.capabilities || model.capabilities || [], // Should come from list if available
          details: {
            ...model.details,
            ...details.details, // Merge any details returned
            context_length: context_length,
          },
        };

        // If 'capabilities' are in details (from /api/show), use those
        // If they are in model list (from /api/tags), we already have them in 'model'
        // I'll take them from wherever they exist.

        mergedModels.push(enhancedModel);
      } catch (err) {
        console.error(`Failed to fetch details for ${model.name}`, err);
        mergedModels.push(model);
      }
    }

    await UpdateSettings("models", mergedModels);
  } catch (error) {
    console.warn("Failed to sync Ollama models:", error);
  }
};
