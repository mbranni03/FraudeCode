import type { Command } from "@/types/CommandDefinition";
import COMMANDS from "./COMMANDS";

// Class for handling commands
class CommandCenter {
  private commands: Command[] = [];

  constructor() {
    this.commands = COMMANDS;
  }

  processCommand = async (query: string) => {
    let command = query.slice(1).split(" ");
    const base = command.shift();

    for (const cmd of this.commands) {
      if (cmd.name === base) {
        if (cmd.subcommands) {
          for (const sub of cmd.subcommands) {
            if (sub.name === command[0]) {
              if (sub.action) return await sub.action(command.slice(1));
            }
          }
          // If no subcommand matched, use the base command's action if it exists
          if (cmd.action) return await cmd.action(command);
        } else {
          if (cmd.action) return await cmd.action(command);
        }
      }
    }
  };

  getAllCommands(): Command[] {
    const templates: Command[] = [];

    for (const cmd of COMMANDS) {
      // Add subcommands
      if (cmd.subcommands) {
        for (const sub of cmd.subcommands) {
          templates.push(sub);
        }
      } else if (!cmd.usage.includes("<subcommand>")) {
        templates.push(cmd);
      }
    }

    return templates;
  }
}

export default new CommandCenter();
