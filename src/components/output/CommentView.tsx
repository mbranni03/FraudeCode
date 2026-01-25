import { Box, Text } from "ink";
import { THEME } from "@/theme";

const CommentView = ({ comment }: { comment: string }) => {
  return (
    <Box marginY={0}>
      <Text color={THEME.dim}># {comment}</Text>
    </Box>
  );
};

export default CommentView;
