import useFraudeStore from "@/store/useFraudeStore";
import { UpdateSettings } from "@/config/settings";
import MistralClient from "@/services/mistral";
import type { Command } from "@/types/CommandDefinition";

const { updateOutput } = useFraudeStore.getState();

const mistralAuth = async (args: string[]) => {
  const apiKey = args[0];
  if (!apiKey) {
    updateOutput("error", "No API key specified (Mistral)");
    return;
  }
  await UpdateSettings({ mistral_api_key: apiKey });
  updateOutput("log", "✓ Mistral API key set");
  await MistralClient.syncMistralModels();
  updateOutput("log", "✓ Mistral models synced");
};

const mistralAuthCommand: Command = {
  name: "auth",
  description: "Set Mistral API key",
  usage: "/mistral auth <api-key>",
  action: mistralAuth,
};

export default mistralAuthCommand;
