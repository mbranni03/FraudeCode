import { Box, Text } from "ink";
import { THEME } from "@/theme";

interface ReasoningViewProps {
  content: string;
  duration?: number;
}

export default function ReasoningView({
  content,
  duration,
}: ReasoningViewProps) {
  return (
    <Box flexDirection="column" marginY={0}>
      <Text color={THEME.dim}>
        [thinking] {content}
        {duration ? ` (${duration.toFixed(1)}s)` : ""}
      </Text>
    </Box>
  );
}
