import { Box, Text } from "ink";

interface ReasoningViewProps {
  content: string;
  duration?: string;
}

export default function ReasoningView({
  content,
  duration,
}: ReasoningViewProps) {
  return (
    <Box marginBottom={1} flexDirection="column">
      <Text dimColor italic>
        {content}
      </Text>
      {duration && (
        <Text dimColor bold>
          Thought for {duration}s
        </Text>
      )}
    </Box>
  );
}
