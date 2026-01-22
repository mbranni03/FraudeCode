import useSettingsStore from "src/store/useSettingsStore";
import Settings, { UpdateSettings } from "src/config/settings";
import useFraudeStore from "src/store/useFraudeStore";
import { groqCommandHandler } from "./groq";
import { openRouterCommandHandler } from "./openrouter";
import log from "@/utils/logger";
import {
  parseModelDisplayId,
  getModelDisplayId,
  getModelUniqueId,
} from "@/types/Model";

const { updateOutput } = useFraudeStore.getState();

class ModelCommandCenter {
  processCommand = async (query: string) => {
    let command = query.slice(1).split(" ");
    const base = command.shift();
    switch (base) {
      case "model":
        await this.setModel(command);
        break;
      case "models":
        updateOutput("settings", "/models");
        break;
      case "groq":
        await groqCommandHandler(command);
        break;
      case "openrouter":
        await openRouterCommandHandler(command);
        break;
      case "ollama":
        break;
      default:
        break;
    }
  };

  setModel = async (args: string[]) => {
    const store = useSettingsStore.getState();
    const models = store.models;

    const subcommand = args[0]?.toLowerCase() ?? "";

    // /model list - show current assignments
    if (subcommand === "list" || args.length === 0) {
      const output = `
Current Model Assignments:
  Reasoning (R): ${store.thinkerModel}
  General (G):   ${store.generalModel}

Usage:
  /model <name>              Set model for all roles
  /model <name> <role>       Set model for specific role
  /model all <name>          Set model for all roles
  /model reasoning <name>    Set reasoning model
  /model general <name>      Set general model
  /model light <name>        Set lightweight model

Roles: r|reasoning, g|general, l|light, a|all`;
      updateOutput("log", output);
      return;
    }

    // Role aliases
    const roleAliases: Record<string, string> = {
      r: "reasoning",
      reasoning: "reasoning",
      g: "general",
      general: "general",
      l: "lightweight",
      light: "lightweight",
      a: "all",
      all: "all",
    };

    // Check if first arg is a role command (list, all, reasoning, general, light)
    const roleCommands = [
      "list",
      "all",
      "reasoning",
      "general",
      "light",
      "r",
      "g",
      "l",
      "a",
    ];

    let modelName: string;
    let role: string;

    if (subcommand && roleCommands.includes(subcommand)) {
      // Format: /model <role> <model-name>
      role = roleAliases[subcommand] ?? subcommand;
      modelName = args.slice(1).join(" ");
    } else {
      // Format: /model <model-name> [role]
      // Check if last arg is a role
      const lastArg = args[args.length - 1]?.toLowerCase() ?? "";
      if (args.length > 1 && lastArg && roleAliases[lastArg]) {
        role = roleAliases[lastArg];
        modelName = args.slice(0, -1).join(" ");
      } else {
        role = "all";
        modelName = args.join(" ");
      }
    }
    if (!modelName) {
      updateOutput(
        "log",
        "Error: No model name specified. Use /model list to see current assignments.",
      );
      return;
    }

    // Try to parse as display ID (e.g., "model-name (provider)")
    const parsed = parseModelDisplayId(modelName);
    let matchedModel;

    if (parsed) {
      // Match by both name and provider type
      matchedModel = models.find(
        (m) =>
          m.name.toLowerCase() === parsed.name.toLowerCase() &&
          m.type === parsed.type,
      );
    } else {
      // Fall back to name-only matching (for backwards compatibility)
      // If multiple models have the same name, this picks the first one
      matchedModel = models.find(
        (m) => m.name.toLowerCase() === modelName.toLowerCase(),
      );
    }

    if (!matchedModel) {
      updateOutput(
        "error",
        `Error: Model "${modelName}" not found. Use /model list to see available models.`,
      );
      return;
    }

    // Use unique ID (name|type) for storage to distinguish same-named models
    const finalModelName = getModelUniqueId(matchedModel);
    const displayName = getModelDisplayId(matchedModel);
    const changedRoles: string[] =
      role === "all" ? ["reasoning", "general", "lightweight"] : [role];
    const updates: Record<string, string> = {};

    switch (role) {
      case "all":
        updates.thinkerModel = finalModelName;
        updates.generalModel = finalModelName;
        updates.lightWeightModel = finalModelName;
        break;
      case "reasoning":
        updates.thinkerModel = finalModelName;
        break;
      case "general":
        updates.generalModel = finalModelName;
        break;
      case "lightweight":
        updates.lightWeightModel = finalModelName;
        break;
      default:
        updateOutput(
          "log",
          `Unknown role: ${role}. Use: r|reasoning, g|general, l|lightweight, a|all`,
        );
        return;
    }

    // Single write for all updates
    await UpdateSettings(updates);

    updateOutput(
      "log",
      `✓ Set ${changedRoles.join(", ")} model to: ${displayName}`,
    );
  };
}

export default new ModelCommandCenter();
