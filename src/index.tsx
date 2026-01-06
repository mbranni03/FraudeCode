import { render } from "ink";
import App from "./components/App";
import { resetLog } from "./utils/logger";
import { Settings, UpdateSettings } from "./utils/Settings";

async function main() {
  resetLog();
  console.clear();
  await Settings.init();
  UpdateSettings("lastOpened", new Date().toISOString());
  render(<App />);
}

main();
