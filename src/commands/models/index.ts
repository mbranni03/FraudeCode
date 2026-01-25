import type { Command } from "@/types/CommandDefinition";
import useFraudeStore from "@/store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

const listModelsCommand: Command = {
  name: "models",
  description: "List available models",
  usage: "/models [provider]",
  action: async (args: string[]) => {
    const provider = args[0]?.toLowerCase();
    updateOutput("settings", provider ? `/models:${provider}` : "/models");
  },
};

export default listModelsCommand;
