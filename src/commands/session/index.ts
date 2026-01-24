import type { Command } from "@/types/CommandDefinition";
import useFraudeStore from "@/store/useFraudeStore";

const sessionCommand: Command = {
  name: "session",
  description: "Manage session",
  usage: "/session <subcommand>",
  subcommands: [
    {
      name: "clear",
      description: "Clear current session",
      usage: "/session clear",
      action: async () => {
        useFraudeStore.getState().contextManager.clearContext();
        useFraudeStore.getState().updateOutput("log", "Session cleared");
      },
    },
  ],
};

export default sessionCommand;
