import { Box, Text } from "ink";
import Gradient from "ink-gradient";
import BigText from "ink-big-text";

const INTRO_THEME = {
  primary: "#FFB6C1",
  primaryLight: "#FFDDE2",
  primaryDim: "#B07D85",
  dim: "#666666",
  gradient: [
    { r: 255, g: 105, b: 180 }, // pink
    { r: 255, g: 120, b: 160 },
    { r: 255, g: 135, b: 145 },
    { r: 255, g: 150, b: 130 },
    { r: 255, g: 165, b: 115 },
    { r: 255, g: 180, b: 100 },
    { r: 255, g: 195, b: 85 },
    { r: 255, g: 210, b: 70 },
    { r: 255, g: 225, b: 55 },
    { r: 240, g: 140, b: 0 }, // orange
  ],
};

export default function IntroComponent() {
  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text color={INTRO_THEME.primaryDim}>
          FRAUDE CODE <Text color={INTRO_THEME.dim}>·</Text>{" "}
          <Text italic>Agentic AI Assistant</Text>
        </Text>
      </Box>

      <Gradient colors={INTRO_THEME.gradient}>
        <BigText text="Fraude" font="block" />
        <BigText text="Code" font="block" />
      </Gradient>

      <Box flexDirection="column">
        <Text color={INTRO_THEME.dim}>Ready to build something amazing?</Text>
        <Box marginTop={1}>
          <Text color={INTRO_THEME.dim}>
            Press{" "}
            <Text bold color={INTRO_THEME.primaryLight}>
              Enter
            </Text>{" "}
            to start your journey...
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
