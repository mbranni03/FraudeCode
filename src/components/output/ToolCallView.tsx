import { Box, Text } from "ink";

interface ToolCallViewProps {
  action: string;
  details?: string;
  result?: string;
  duration?: string;
}

export default function ToolCallView({
  action,
  details,
  result,
  duration,
}: ToolCallViewProps) {
  // Truncate result preview to 80 chars
  const resultPreview = result
    ? result.length > 80
      ? result.slice(0, 77) + "..."
      : result
    : null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="rgb(255, 140, 0)">•</Text>
        <Text> </Text>
        <Text bold>{action}</Text>
        {details && <Text dimColor>({details})</Text>}
        {duration && <Text dimColor> · {duration}</Text>}
      </Box>
      {resultPreview && (
        <Box paddingLeft={2}>
          <Text dimColor>→ {resultPreview}</Text>
        </Box>
      )}
    </Box>
  );
}
