import { UpdateSettings } from "src/config/settings";
import useFraudeStore from "src/store/useFraudeStore";
import type { Command } from "@/types/CommandDefinition";

const { updateOutput } = useFraudeStore.getState();

const googleAuth = async (args: string[]) => {
  const apiKey = args[0];
  if (!apiKey) {
    updateOutput("error", "No API key specified (Google)");
    return;
  }
  await UpdateSettings({ google_api_key: apiKey });
  updateOutput("log", "✓ Google API key set");
};

const googleAuthCommand: Command = {
  name: "auth",
  description: "Set Google API key",
  usage: "/google auth <api-key>",
  action: googleAuth,
};

export default googleAuthCommand;
