import GroqClient from "@/services/groq";
import type { Model } from "@/types/Model";
import useSettingsStore from "@/store/useSettingsStore";
import { UpdateSettings } from "src/config/settings";
import useFraudeStore from "src/store/useFraudeStore";
import type { Command } from "@/types/CommandDefinition";

const { updateOutput } = useFraudeStore.getState();

const addGroqModel = async (args: string[]) => {
  const model = args[0];
  if (!model) {
    updateOutput("error", "No model specified (Groq)");
    return;
  }
  const modelData: any = await GroqClient.getModelData(model);

  if (!modelData) {
    throw new Error(`No data found for Groq model ${model}`);
  }

  const newModel: Model = {
    type: "groq",
    name: model,
    modified_at: new Date(modelData.created * 1000).toISOString(),
    digest: modelData.id,
    capabilities: [],
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    details: {
      context_length: modelData.context_window,
    },
  };

  const savedModels = useSettingsStore.getState().models || [];

  const existingIndex = savedModels.findIndex(
    (m) => m.name === newModel.name && m.type === "groq",
  );

  if (existingIndex >= 0) {
    savedModels[existingIndex] = newModel;
  } else {
    savedModels.push(newModel);
  }
  await UpdateSettings({ models: savedModels });
  updateOutput("log", "Groq model added: " + model);
};

const addGroqModelCommand: Command = {
  name: "add",
  description: "Add a Groq model",
  usage: "/groq add <model-name>",
  action: addGroqModel,
};

export default addGroqModelCommand;
