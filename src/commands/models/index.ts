import type { Command } from "@/types/CommandDefinition";
import useFraudeStore from "@/store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

const listModelsCommand: Command = {
  name: "models",
  description: "List available models",
  usage: "/models",
  action: async () => {
    updateOutput("settings", "/models");
  },
};

export default listModelsCommand;
