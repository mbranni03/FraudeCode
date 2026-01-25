import { Box, Text } from "ink";
import type { OutputItem } from "@/types/OutputItem";
import { THEME } from "@/theme";

const CheckpointView = ({ item }: { item: OutputItem }) => {
  return (
    <Box flexDirection="column">
      {item.content && <Text color={THEME.primaryDim}>{item.content}</Text>}
    </Box>
  );
};

export default CheckpointView;
