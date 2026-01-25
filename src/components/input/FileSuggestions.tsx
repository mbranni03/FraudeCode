import { Box, Text } from "ink";
import { THEME } from "@/theme";

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
      borderStyle="round"
      borderColor={THEME.border} // Distinct color for files
      width={70}
    >
      <Text dimColor>Files (Tab to select):</Text>
      {suggestions.map((file, i) => (
        <Box key={file}>
          <Text
            color={i === selectedIndex ? THEME.primaryLight : THEME.dim}
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
