import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import useFraudeStore from "../store/useFraudeStore";
import type { TokenUsage } from "@/types/TokenUsage";
import { THEME } from "../theme";

const LoaderComponent = () => {
  const [i, setFrame] = useState(0);
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  const { status, elapsedTime, statusText } = useFraudeStore();

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (status === 1) {
      timer = setInterval(() => {
        setFrame((prevIndex) => (prevIndex + 1) % frames.length);

        const currentElapsed = useFraudeStore.getState().elapsedTime;
        useFraudeStore.setState({
          elapsedTime: currentElapsed + 1,
        });
      }, 80);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [status]);

  const currentStatusText = statusText || "Agent is working";

  return (
    <Box marginY={0}>
      <Text color={THEME.primary}>{frames[i]} </Text>
      <Text color={THEME.text}>{currentStatusText}</Text>
      <Box paddingLeft={1}>
        <Text color={THEME.dim}>
          ({(elapsedTime / 10).toFixed(1)}s · ESC to interrupt)
        </Text>
      </Box>
    </Box>
  );
};

//  {status === 2 && (
//     <Text dimColor>
//       Finished ({(elapsed / 10).toFixed(1)}s ※ {tokenUsage.total} tokens)
//     </Text>
//   )}
//   {status === 3 && (
//     <Text color="yellow">
//       ▶ Awaiting user confirmation... ({(elapsed / 10).toFixed(1)}s)
//     </Text>
//   )}
//   {status === -1 && (
//     <Text dimColor>Interrupted ({(elapsed / 10).toFixed(1)}s)</Text>
//   )}

export default LoaderComponent;
