import type { Command } from "@/types/CommandDefinition";
import groqAuthCommand from "./auth";
import addGroqModelCommand from "./add_model";

import useFraudeStore from "@/store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

const groqCommands: Command = {
  name: "groq",
  description: "Manage Groq models",
  usage: "/groq <subcommand>",
  action: async (args: string[]) => {
    if (args.length === 0 || args[0] === "list" || args[0] === "models") {
      updateOutput("settings", "/models:groq");
      return;
    }
  },
  subcommands: [
    groqAuthCommand,
    addGroqModelCommand,
    {
      name: "list",
      description: "List Groq models",
      usage: "/groq list",
      action: async () => {
        updateOutput("settings", "/models:groq");
      },
    },
  ],
};

export default groqCommands;
