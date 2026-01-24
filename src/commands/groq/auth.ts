import { UpdateSettings } from "src/config/settings";
import useFraudeStore from "src/store/useFraudeStore";
import type { Command } from "@/types/CommandDefinition";

const { updateOutput } = useFraudeStore.getState();

const groqAuth = async (args: string[]) => {
  const apiKey = args[0];
  if (!apiKey) {
    updateOutput("error", "No API key specified (Groq)");
    return;
  }
  await UpdateSettings({ groq_api_key: apiKey });
  updateOutput("log", "Groq API key set");
};

const groqAuthCommand: Command = {
  name: "auth",
  description: "Set Groq API key",
  usage: "/groq auth <api-key>",
  action: groqAuth,
};

export default groqAuthCommand;
