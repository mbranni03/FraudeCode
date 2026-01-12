import log from "../utils/logger";
import { Box, useInput } from "ink";
import InputBox from "./InputBox";
import OutputRenderer from "./OutputRenderer";
import useFraudeStore from "../store/useFraudeStore";
export default function App() {
  useInput((input, key) => {
    // if (key.ctrl) {
    //   process.exit(0);
    // }
  });

  const { status } = useFraudeStore();
  return (
    <Box flexDirection="column">
      <OutputRenderer />
      {status === 0 && <InputBox />}
    </Box>
  );
}
