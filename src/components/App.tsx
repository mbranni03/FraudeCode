import log from "../utils/logger";
import { Box, useInput } from "ink";
import InputBox from "./InputBox";
import OutputRenderer from "./OutputRenderer";
import useFraudeStore from "../store/useFraudeStore";
import IntroComponent from "./IntroComponent";
export default function App() {
  const { status, started } = useFraudeStore();

  useInput((input, key) => {
    if (key.return && !started) {
      useFraudeStore.setState({ started: true });
      log("App Started...");
    }
    // if (key.ctrl) {
    //   process.exit(0);
    // }
  });
  return (
    <Box flexDirection="column">
      {!started ? (
        <IntroComponent />
      ) : (
        <Box flexDirection="column">
          <OutputRenderer />
          {status === 0 && <InputBox />}
        </Box>
      )}
    </Box>
  );
}
