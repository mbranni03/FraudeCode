import { Box, Text, useInput } from "ink";
import { THEME } from "../../theme";
import { BunApiRouter } from "../../utils/router";
import { useState } from "react";

interface InteractiveServerViewProps {
  routerId: string;
}

export default function InteractiveServerView({
  routerId,
}: InteractiveServerViewProps) {
  const [stopped, setStopped] = useState(false);

  useInput((input, key) => {
    if (stopped) return;

    if (input === "q") {
      BunApiRouter.stopRouter(routerId);
      setStopped(true);
    }
  });

  if (stopped) {
    return (
      <Box borderStyle="round" borderColor={THEME.dim} paddingX={1}>
        <Text color={THEME.dim}>Server stopped.</Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="round" borderColor={THEME.primary} paddingX={1}>
      <Text color={THEME.primary}>Server running... </Text>
      <Text color={THEME.text}>Press </Text>
      <Text color={THEME.warning} bold>
        q
      </Text>
      <Text color={THEME.text}> to stop.</Text>
    </Box>
  );
}
