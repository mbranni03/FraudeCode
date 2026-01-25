import type { Command } from "@/types/CommandDefinition";
import openRouterAuthCommand from "./auth";
import addOpenRouterModelCommand from "./add_model";

import useFraudeStore from "@/store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

const openRouterCommands: Command = {
  name: "openrouter",
  description: "Manage OpenRouter models",
  usage: "/openrouter <subcommand>",
  action: async (args: string[]) => {
    if (args.length === 0 || args[0] === "list" || args[0] === "models") {
      updateOutput("settings", "/models:openrouter");
      return;
    }
  },
  subcommands: [
    openRouterAuthCommand,
    addOpenRouterModelCommand,
    {
      name: "list",
      description: "List OpenRouter models",
      usage: "/openrouter list",
      action: async () => {
        updateOutput("settings", "/models:openrouter");
      },
    },
  ],
};

export default openRouterCommands;
