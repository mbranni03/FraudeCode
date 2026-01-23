import { UpdateSettings } from "src/config/settings";
import useFraudeStore from "src/store/useFraudeStore";
import CerebrasClient from "@/services/cerebras";

const { updateOutput } = useFraudeStore.getState();

const cerebrasAuth = async (apiKey: string) => {
  await UpdateSettings({ cerebras_api_key: apiKey });
  updateOutput("log", "✓ Cerebras API key set");
  await CerebrasClient.syncCerebrasModels();
  updateOutput("log", "✓ Cerebras models synced");
};

export const cerebrasCommandHandler = async (command: string[]) => {
  try {
    const base = command.shift();
    switch (base) {
      case "auth":
        const apiKey = command.shift();
        if (!apiKey) {
          updateOutput("error", "No API key specified (Cerebras)");
          return;
        }
        await cerebrasAuth(apiKey);
        break;
      default:
        updateOutput("error", "Unknown command (Cerebras)");
        break;
    }
  } catch (err) {
    updateOutput("error", `${err} (Cerebras)`);
  }
};
