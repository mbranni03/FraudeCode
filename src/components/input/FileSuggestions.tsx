import { Box, Text } from "ink";

export default function FileSuggestions({
  selectedIndex,
  suggestions,
}: {
  selectedIndex: number;
  suggestions: string[];
}) {
  return (
    <Box
      flexDirection="column"
      paddingX={2}
      borderStyle="single"
      borderColor="blue" // Distinct color for files
      width={68}
      marginLeft={1}
    >
      <Text dimColor>Files (Tab to select):</Text>
      {suggestions.map((file, i) => (
        <Box key={file}>
          <Text
            color={i === selectedIndex ? "cyan" : "gray"}
            bold={i === selectedIndex}
          >
            {i === selectedIndex ? "› " : "  "}
            {file}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
