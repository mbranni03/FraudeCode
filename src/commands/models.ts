import useSettingsStore from "src/store/useSettingsStore";
import Settings, { UpdateSettings } from "src/config/settings";
import useFraudeStore from "src/store/useFraudeStore";
import { groqCommandHandler } from "./groq";
import { openRouterCommandHandler } from "./openrouter";
import { mistralCommandHandler } from "./mistral";
import { cerebrasCommandHandler } from "./cerebras";
import log from "@/utils/logger";
import {
  type ProviderType,
  ProviderTypes,
  parseModelDisplayId,
  getModelDisplayId,
  getModelUniqueId,
} from "@/types/Model";

const { updateOutput } = useFraudeStore.getState();

const providerHandlers: Partial<
  Record<ProviderType, (command: string[]) => Promise<void>>
> = {
  groq: groqCommandHandler,
  openrouter: openRouterCommandHandler,
  mistral: mistralCommandHandler,
  cerebras: cerebrasCommandHandler,
};

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
      default:
        if (
          base &&
          ProviderTypes.includes(base as ProviderType) &&
          providerHandlers[base as ProviderType]
        ) {
          await providerHandlers[base as ProviderType]!(command);
        }
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
  Primary (P):   ${store.primaryModel}
  Secondary (S): ${store.secondaryModel}

Usage:
  /model <name>              Set model for all roles
  /model <name> <role>       Set model for specific role
  /model all <name>          Set model for all roles
  /model primary <name>      Set primary model
  /model secondary <name>    Set secondary model

Roles: p|primary, s|secondary, a|all`;
      updateOutput("log", output);
      return;
    }

    // Role aliases
    const roleAliases: Record<string, string> = {
      p: "primary",
      primary: "primary",
      s: "secondary",
      secondary: "secondary",
      a: "all",
      all: "all",
    };

    // Check if first arg is a role command
    const roleCommands = ["list", "all", "primary", "secondary", "p", "s", "a"];

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
      role === "all" ? ["primary", "secondary"] : [role];
    const updates: Record<string, string> = {};

    switch (role) {
      case "all":
        updates.primaryModel = finalModelName;
        updates.secondaryModel = finalModelName;
        break;
      case "primary":
        updates.primaryModel = finalModelName;
        break;
      case "secondary":
        updates.secondaryModel = finalModelName;
        break;
      default:
        updateOutput(
          "log",
          `Unknown role: ${role}. Use: p|primary, s|secondary, a|all`,
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
