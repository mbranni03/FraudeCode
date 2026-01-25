import { Box, Text } from "ink";
import { THEME } from "@/theme";

const ErrorView = ({ error }: { error: string }) => {
  return (
    <Box marginY={0}>
      <Text color={THEME.error} bold>
        ✘ {error}
      </Text>
    </Box>
  );
};

export default ErrorView;
