import { UpdateSettings } from "src/config/settings";
import useFraudeStore from "src/store/useFraudeStore";
import CerebrasClient from "@/services/cerebras";
import type { Command } from "@/types/CommandDefinition";

const { updateOutput } = useFraudeStore.getState();

const cerebrasAuth = async (args: string[]) => {
  const apiKey = args[0];
  if (!apiKey) {
    updateOutput("error", "No API key specified (Cerebras)");
    return;
  }
  await UpdateSettings({ cerebras_api_key: apiKey });
  updateOutput("log", "✓ Cerebras API key set");
  await CerebrasClient.syncCerebrasModels();
  updateOutput("log", "✓ Cerebras models synced");
};

const cerebrasAuthCommand: Command = {
  name: "auth",
  description: "Set Cerebras API key",
  usage: "/cerebras auth <api-key>",
  action: cerebrasAuth,
};

export default cerebrasAuthCommand;
