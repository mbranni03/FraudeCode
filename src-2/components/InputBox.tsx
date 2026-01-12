import { useState } from "react";
import { useApp, Box, Text } from "ink";
import { TextInput } from "@inkjs/ui";
import { homedir } from "os";
import QueryHandler from "../utils/QueryHandler";

const shortenPath = (path: string) => {
  const home = homedir();
  if (path.startsWith(home)) {
    return path.replace(home, "~");
  }
  return path;
};

const InputBoxComponent = () => {
  const { exit } = useApp();
  const [inputKey, setInputKey] = useState(0);

  const processSubmit = (v: string) => {
    if (v.trim().toLowerCase() === "exit") {
      exit();
      return;
    }
    if (v.trim() === "") return;
    // addToHistory(v);
    setInputKey((k) => k + 1); // Clear input by remounting TextInput
    QueryHandler(v);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text>Type something and press enter or type "exit" to exit:</Text>
      <Box borderStyle="round" borderColor="white" paddingX={1} width={70}>
        <Text bold>&gt; </Text>
        <Box flexGrow={1}>
          <TextInput
            key={inputKey}
            placeholder="Enter command or query..."
            onSubmit={processSubmit}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default InputBoxComponent;
