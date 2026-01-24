import { UpdateSettings } from "src/config/settings";
import useFraudeStore from "src/store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

const googleAuth = async (apiKey: string) => {
  await UpdateSettings({ google_api_key: apiKey });
  updateOutput("log", "✓ Google API key set");
};

export const googleCommandHandler = async (command: string[]) => {
  try {
    const base = command.shift();
    switch (base) {
      case "auth":
        const apiKey = command.shift();
        if (!apiKey) {
          updateOutput("error", "No API key specified (Google)");
          return;
        }
        await googleAuth(apiKey);
        break;
      default:
        updateOutput("error", "Unknown command (Google)");
        break;
    }
  } catch (err) {
    updateOutput("error", `${err} (Google)`);
  }
};
