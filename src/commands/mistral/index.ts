import type { Command } from "@/types/CommandDefinition";
import mistralAuthCommand from "./auth";

import useFraudeStore from "@/store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

const mistralCommands: Command = {
  name: "mistral",
  description: "Manage Mistral models",
  usage: "/mistral <subcommand>",
  action: async (args: string[]) => {
    if (args.length === 0 || args[0] === "list" || args[0] === "models") {
      updateOutput("settings", "/models:mistral");
      return;
    }
  },
  subcommands: [
    mistralAuthCommand,
    {
      name: "list",
      description: "List Mistral models",
      usage: "/mistral list",
      action: async () => {
        updateOutput("settings", "/models:mistral");
      },
    },
  ],
};

export default mistralCommands;
