import type { Command } from "@/types/CommandDefinition";
import mistralAuthCommand from "./auth";

const mistralCommands: Command = {
  name: "mistral",
  description: "Manage Mistral models",
  usage: "/mistral <subcommand>",
  subcommands: [mistralAuthCommand],
};

export default mistralCommands;
