import type { Command } from "@/types/CommandDefinition";
import cerebrasAuthCommand from "./auth";

const cerebrasCommands: Command = {
  name: "cerebras",
  description: "Manage Cerebras models",
  usage: "/cerebras <subcommand>",
  subcommands: [cerebrasAuthCommand],
};

export default cerebrasCommands;
