import { Box, Text } from "ink";
import { THEME } from "@/theme";

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
    <Box flexDirection="column" marginY={0}>
      <Box>
        <Text color={THEME.primary}>◇</Text>
        <Text> </Text>
        <Text color={THEME.text}>{action}</Text>
        {details && (
          <Text color={THEME.dim}>
            {" "}
            {details.length > 50 ? details.slice(0, 47) + "..." : details}
          </Text>
        )}
        {duration && <Text color={THEME.dim}> {duration}</Text>}
      </Box>
      {resultPreview && (
        <Box paddingLeft={2}>
          <Text color={THEME.dim}>↳ {resultPreview}</Text>
        </Box>
      )}
    </Box>
  );
}
