import { Box, Text } from "ink";

const CommentView = ({ comment }: { comment: string }) => {
  return (
    <Box paddingTop={1}>
      <Text color="rgb(255, 140, 0)">~</Text>
      <Box paddingLeft={1}>
        <Text dimColor>{comment}</Text>
      </Box>
    </Box>
  );
};

export default CommentView;
