import type { Command } from "@/types/CommandDefinition";
import openRouterAuthCommand from "./auth";
import addOpenRouterModelCommand from "./add_model";

const openRouterCommands: Command = {
  name: "openrouter",
  description: "Manage OpenRouter models",
  usage: "/openrouter <subcommand>",
  subcommands: [openRouterAuthCommand, addOpenRouterModelCommand],
};

export default openRouterCommands;
