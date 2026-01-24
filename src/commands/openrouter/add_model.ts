import type { Command } from "@/types/CommandDefinition";
import { UpdateSettings } from "@/config/settings";
import useFraudeStore from "@/store/useFraudeStore";
import OpenRouterClient from "@/services/openrouter";
import type { Model } from "@/types/Model";
import useSettingsStore from "@/store/useSettingsStore";

const { updateOutput } = useFraudeStore.getState();

const addOpenRouterModel = async (args: string[]) => {
  const model = args[0];
  if (!model) {
    updateOutput("error", "No model specified (OpenRouter)");
    return;
  }
  const data: any = await OpenRouterClient.getModelData(model);
  const modelData = data.data;

  if (!modelData) {
    throw new Error(`No data found for OpenRouter model ${model}`);
  }

  const endpoint = modelData.endpoints?.[0];

  const newModel: Model = {
    type: "openrouter",
    name: modelData.id,
    modified_at: new Date(modelData.created * 1000).toISOString(),
    digest: modelData.id,
    capabilities: endpoint?.supported_parameters || [],
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    details: {
      context_length: endpoint?.context_length,
    },
  };

  const savedModels = useSettingsStore.getState().models || [];

  // Check if model already exists, update if so, else add
  const existingIndex = savedModels.findIndex(
    (m) => m.name === newModel.name && m.type === "openrouter",
  );

  if (existingIndex >= 0) {
    savedModels[existingIndex] = newModel;
  } else {
    savedModels.push(newModel);
  }
  await UpdateSettings({ models: savedModels });
  updateOutput("log", "OpenRouter model added: " + model);
};

const addOpenRouterModelCommand: Command = {
  name: "add",
  description: "Add OpenRouter model",
  usage: "/openrouter add <model>",
  action: addOpenRouterModel,
};

export default addOpenRouterModelCommand;
