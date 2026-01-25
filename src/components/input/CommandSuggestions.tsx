import { Box, Text } from "ink";
import type { Command } from "@/types/CommandDefinition";
import { THEME } from "@/theme";

export default function CommandSuggestions({
  selectedIndex,
  filteredTemplates,
}: {
  selectedIndex: number;
  filteredTemplates: Command[];
}) {
  return (
    <Box
      flexDirection="column"
      paddingX={2}
      borderStyle="round"
      borderColor={THEME.border}
      width={70}
    >
      <Text dimColor>Commands (Tab accepts ghost text):</Text>
      {filteredTemplates.map((cmd, i) => (
        <Box key={cmd.usage}>
          <Text
            color={i === selectedIndex ? THEME.primaryLight : THEME.dim}
            bold={i === selectedIndex}
          >
            {i === selectedIndex ? "› " : "  "}
            {cmd.usage}
          </Text>
          <Text color={THEME.dim}> - {cmd.description}</Text>
        </Box>
      ))}
      {/* Show role hint if selected command has [role] */}
      {filteredTemplates[selectedIndex]?.usage.includes("[role]") && (
        <Text dimColor italic>
          {"  "}[role]: reasoning | general | light | all (or r|g|l|a)
        </Text>
      )}
    </Box>
  );
}
