import type { Command } from "@/types/CommandDefinition";
import useFraudeStore from "@/store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

const ollamaCommand: Command = {
  name: "ollama",
  description: "Manage Ollama models",
  usage: "/ollama [subcommand]",
  action: async (args: string[]) => {
    if (args.length === 0 || args[0] === "list" || args[0] === "models") {
      updateOutput("settings", "/models:ollama");
      return;
    }
    // Future: handle other ollama subcommands like pull, rm, etc.
  },
  subcommands: [
    {
      name: "list",
      description: "List Ollama models",
      usage: "/ollama list",
      action: async () => {
        updateOutput("settings", "/models:ollama");
      },
    },
  ],
};

export default ollamaCommand;
