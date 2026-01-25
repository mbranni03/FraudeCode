import { Box, Text } from "ink";
import { useMemo } from "react";
import useFraudeStore from "@/store/useFraudeStore";
import useSettingsStore from "@/store/useSettingsStore";
import { THEME } from "@/theme";

const ContextUsage = () => {
  const { contextManager } = useFraudeStore();
  const { primaryModel, models } = useSettingsStore();

  const { usedTokens, maxTokens, percentage, progressBar } = useMemo(() => {
    // Find the current model from the models list
    const currentModel = models.find((m) => m.name === primaryModel);
    const contextLength = currentModel?.details?.context_length || 128000; // Default fallback

    const used = contextManager.estimateContextTokens();
    const pct = Math.min((used / contextLength) * 100, 100);

    // Create a simple visual progress bar
    const barWidth = 20;
    const filledWidth = Math.round((pct / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const bar = "█".repeat(filledWidth) + "░".repeat(emptyWidth);

    return {
      usedTokens: used,
      maxTokens: contextLength,
      percentage: pct,
      progressBar: bar,
    };
  }, [contextManager, primaryModel, models]);

  // Color based on usage percentage
  const getColor = () => {
    if (percentage >= 90) return THEME.error;
    if (percentage >= 70) return THEME.primaryDim;
    if (percentage >= 50) return THEME.warning;
    return THEME.info;
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return tokens.toString();
  };

  return (
    <Box flexDirection="row" gap={1}>
      <Text color={THEME.dim}>[</Text>
      <Text color={getColor()}>{progressBar}</Text>
      <Text color={THEME.dim}>]</Text>
      <Box paddingLeft={1}>
        <Text color={THEME.text}>{formatTokens(usedTokens)}</Text>
        <Text color={THEME.dim}>/{formatTokens(maxTokens)}</Text>
        <Text color={getColor()}> {percentage.toFixed(0)}%</Text>
      </Box>
    </Box>
  );
};

export default ContextUsage;
