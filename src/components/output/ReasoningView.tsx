import { Box, Text } from "ink";

interface ReasoningViewProps {
  content: string;
  duration?: number;
}

export default function ReasoningView({
  content,
  duration,
}: ReasoningViewProps) {
  return (
    <Box flexDirection="column">
      <Text dimColor italic>
        {content}
      </Text>
      {duration ? (
        <Text dimColor bold>
          Thought for {duration.toFixed(1)}s
        </Text>
      ) : null}
    </Box>
  );
}
