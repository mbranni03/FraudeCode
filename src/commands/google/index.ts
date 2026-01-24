import type { Command } from "@/types/CommandDefinition";
import googleAuthCommand from "./auth";

const googleCommands: Command = {
  name: "google",
  description: "Manage Google models",
  usage: "/google <subcommand>",
  subcommands: [googleAuthCommand],
};

export default googleCommands;
