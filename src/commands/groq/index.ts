import type { Command } from "@/types/CommandDefinition";
import groqAuthCommand from "./auth";
import addGroqModelCommand from "./add_model";

const groqCommands: Command = {
  name: "groq",
  description: "Manage Groq models",
  usage: "/groq <subcommand>",
  subcommands: [groqAuthCommand, addGroqModelCommand],
};

export default groqCommands;
