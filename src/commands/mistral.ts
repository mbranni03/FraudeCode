import { UpdateSettings } from "src/config/settings";
import useFraudeStore from "src/store/useFraudeStore";
import MistralClient from "@/services/mistral";

const { updateOutput } = useFraudeStore.getState();

const mistralAuth = async (apiKey: string) => {
  await UpdateSettings({ mistral_api_key: apiKey });
  updateOutput("log", "✓ Mistral API key set");
  await MistralClient.syncMistralModels();
  updateOutput("log", "✓ Mistral models synced");
};

export const mistralCommandHandler = async (command: string[]) => {
  try {
    const base = command.shift();
    switch (base) {
      case "auth":
        const apiKey = command.shift();
        if (!apiKey) {
          updateOutput("error", "No API key specified (Mistral)");
          return;
        }
        await mistralAuth(apiKey);
        break;
      default:
        updateOutput("error", "Unknown command (Mistral)");
        break;
    }
  } catch (err) {
    updateOutput("error", `${err} (Mistral)`);
  }
};
