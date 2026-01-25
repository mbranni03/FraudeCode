import type { Command } from "@/types/CommandDefinition";
import cerebrasAuthCommand from "./auth";

import useFraudeStore from "@/store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

const cerebrasCommands: Command = {
  name: "cerebras",
  description: "Manage Cerebras models",
  usage: "/cerebras <subcommand>",
  action: async (args: string[]) => {
    if (args.length === 0 || args[0] === "list" || args[0] === "models") {
      updateOutput("settings", "/models:cerebras");
      return;
    }
  },
  subcommands: [
    cerebrasAuthCommand,
    {
      name: "list",
      description: "List Cerebras models",
      usage: "/cerebras list",
      action: async () => {
        updateOutput("settings", "/models:cerebras");
      },
    },
  ],
};

export default cerebrasCommands;
