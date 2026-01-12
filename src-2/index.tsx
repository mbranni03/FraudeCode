import { render } from "ink";
import App from "./components/App";
import { resetLog } from "./utils/logger";
import { Settings } from "./utils/Settings";
import useSettingsStore from "./store/useSettingsStore";

async function main() {
  resetLog();
  console.clear();
  await Settings.init();
  // syncOllamaModels().catch((e) => {
  //   console.error("Background model sync failed:", e);
  // });
  useSettingsStore.getState().syncWithSettings();
  render(<App />);
}

main();
