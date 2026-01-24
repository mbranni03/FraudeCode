import type { Command } from "@/types/CommandDefinition";
import useFraudeStore from "@/store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

const usageCommand: Command = {
  name: "usage",
  description: "Show usage information",
  usage: "/usage",
  action: async () => {
    updateOutput("settings", "/usage");
  },
};

export default usageCommand;
