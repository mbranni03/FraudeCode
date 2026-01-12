import { render } from "ink";
import App from "./components/App";
import { resetLog } from "./utils/logger";

async function main() {
  resetLog();
  console.clear();
  render(<App />);
}

main();
