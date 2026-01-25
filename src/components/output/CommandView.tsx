import { Box, Text } from "ink";
import { THEME } from "@/theme";

const CommandView = ({ command }: { command: string }) => {
  return (
    <Box marginY={0}>
      <Text color={THEME.dim}>&gt; </Text>
      <Text color={THEME.text}>{command}</Text>
    </Box>
  );
};

export default CommandView;
