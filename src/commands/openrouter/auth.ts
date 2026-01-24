import type { Command } from "@/types/CommandDefinition";
import { UpdateSettings } from "@/config/settings";
import useFraudeStore from "@/store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

const openRouterAuth = async (args: string[]) => {
  const apiKey = args[0];
  if (!apiKey) {
    updateOutput("error", "No API key specified (OpenRouter)");
    return;
  }
  await UpdateSettings({ openrouter_api_key: apiKey });
  updateOutput("log", "OpenRouter API key set");
};

const openRouterAuthCommand: Command = {
  name: "auth",
  description: "Set OpenRouter API key",
  usage: "/openrouter auth <api-key>",
  action: openRouterAuth,
};

export default openRouterAuthCommand;
