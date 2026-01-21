import { Box, Text } from "ink";
import { useMemo } from "react";
import type { Model, ProviderType } from "@/types/Model";
import useSettingsStore from "@/store/useSettingsStore";

// Theme colors (consistent with ModelList)
const COLORS = {
  accent: "#FF69B4", // Pink for highlights
  header: "#87CEEB", // Sky blue for headers
  muted: "gray",
  dim: "gray",
  text: "white",
  progress: "#20B2AA", // Teal for progress bars
  prompt: "#9370DB", // Purple for prompt tokens
  completion: "#FF8C00", // Orange for completion tokens
  total: "#ffc169", // Light orange for totals
};

// Provider display names and colors
const PROVIDER_STYLES: Record<ProviderType, { name: string; color: string }> = {
  groq: { name: "Groq", color: "#FF6B6B" },
  openrouter: { name: "OpenRouter", color: "#4ECDC4" },
  ollama: { name: "Ollama", color: "#95E1D3" },
};

// Format token count with K/M suffix
const formatTokens = (tokens: number): string => {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 10_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(2)}k`;
  }
  return tokens.toLocaleString();
};

// Calculate usage data per provider
interface ProviderUsage {
  provider: ProviderType;
  models: ModelUsage[];
  totalPrompt: number;
  totalCompletion: number;
  totalTokens: number;
}

interface ModelUsage {
  name: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  percentOfProvider: number;
  percentOfTotal: number;
}

// Progress bar component
interface ProgressBarProps {
  percent: number;
  width?: number;
  color?: string;
}

const ProgressBar = ({
  percent,
  width = 20,
  color = COLORS.progress,
}: ProgressBarProps) => {
  const safePercent = Math.min(100, Math.max(0, percent));
  const filled = Math.round((safePercent / 100) * width);
  const empty = width - filled;

  return (
    <Text>
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text color={COLORS.dim}>{"░".repeat(empty)}</Text>
    </Text>
  );
};

// Model row in the usage table
interface ModelRowProps {
  model: ModelUsage;
  maxNameWidth: number;
}

const ModelRow = ({ model, maxNameWidth }: ModelRowProps) => {
  return (
    <Box flexDirection="row" gap={1}>
      {/* Model name */}
      <Box width={maxNameWidth}>
        <Text color={COLORS.text} wrap="truncate-end">
          {model.name}
        </Text>
      </Box>

      {/* Progress bar for provider % */}
      <Box width={12}>
        <ProgressBar percent={model.percentOfProvider} width={10} />
      </Box>

      {/* Percentage */}
      <Box width={6} justifyContent="flex-end">
        <Text
          color={model.percentOfProvider > 50 ? COLORS.accent : COLORS.muted}
        >
          {model.percentOfProvider.toFixed(1)}%
        </Text>
      </Box>

      {/* Token breakdown */}
      <Box width={10} justifyContent="flex-end">
        <Text color={COLORS.prompt}>{formatTokens(model.promptTokens)}</Text>
      </Box>
      <Box width={1}>
        <Text color={COLORS.dim}>/</Text>
      </Box>
      <Box width={10} justifyContent="flex-end">
        <Text color={COLORS.completion}>
          {formatTokens(model.completionTokens)}
        </Text>
      </Box>
      <Box width={1}>
        <Text color={COLORS.dim}>=</Text>
      </Box>
      <Box width={10} justifyContent="flex-end">
        <Text color={COLORS.total} bold>
          {formatTokens(model.totalTokens)}
        </Text>
      </Box>
    </Box>
  );
};

// Provider section component
interface ProviderSectionProps {
  usage: ProviderUsage;
  globalTotal: number;
}

const ProviderSection = ({ usage, globalTotal }: ProviderSectionProps) => {
  const style = PROVIDER_STYLES[usage.provider];
  const providerPercent =
    globalTotal > 0 ? (usage.totalTokens / globalTotal) * 100 : 0;
  const maxNameWidth = Math.max(20, ...usage.models.map((m) => m.name.length));

  if (usage.models.length === 0 || usage.totalTokens === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Provider header */}
      <Box marginBottom={0}>
        <Text color={style.color} bold>
          {style.name}
        </Text>
        <Text color={COLORS.dim}> ─ </Text>
        <Text color={COLORS.total} bold>
          {formatTokens(usage.totalTokens)}
        </Text>
        <Text color={COLORS.dim}> tokens </Text>
        <Text color={COLORS.accent}>({providerPercent.toFixed(1)}%</Text>
        <Text color={COLORS.dim}> of total)</Text>
      </Box>

      {/* Provider table */}
      <Box
        borderStyle="round"
        borderColor={style.color}
        flexDirection="column"
        paddingX={1}
      >
        {/* Column headers */}
        <Box flexDirection="row" gap={1}>
          <Box width={maxNameWidth}>
            <Text color={COLORS.dim}>Model</Text>
          </Box>
          <Box width={12}>
            <Text color={COLORS.dim}>Usage</Text>
          </Box>
          <Box width={6} justifyContent="flex-end">
            <Text color={COLORS.dim}>%</Text>
          </Box>
          <Box width={10} justifyContent="flex-end">
            <Text color={COLORS.prompt}>Prompt</Text>
          </Box>
          <Box width={1}>
            <Text color={COLORS.dim}> </Text>
          </Box>
          <Box width={10} justifyContent="flex-end">
            <Text color={COLORS.completion}>Compl</Text>
          </Box>
          <Box width={1}>
            <Text color={COLORS.dim}> </Text>
          </Box>
          <Box width={10} justifyContent="flex-end">
            <Text color={COLORS.total}>Total</Text>
          </Box>
        </Box>

        {/* Separator */}
        <Text color={COLORS.dim}>{"─".repeat(maxNameWidth + 55)}</Text>

        {/* Model rows sorted by usage */}
        {usage.models
          .sort((a, b) => b.totalTokens - a.totalTokens)
          .map((model) => (
            <ModelRow
              key={model.name}
              model={model}
              maxNameWidth={maxNameWidth}
            />
          ))}
      </Box>
    </Box>
  );
};

// Summary card at top
interface SummaryCardProps {
  totalTokens: number;
  totalPrompt: number;
  totalCompletion: number;
  providerBreakdown: {
    provider: ProviderType;
    tokens: number;
    percent: number;
  }[];
}

const SummaryCard = ({
  totalTokens,
  totalPrompt,
  totalCompletion,
  providerBreakdown,
}: SummaryCardProps) => {
  return (
    <Box
      borderStyle="double"
      borderColor={COLORS.accent}
      flexDirection="column"
      paddingX={2}
      paddingY={0}
      marginBottom={1}
    >
      <Box justifyContent="center">
        <Text color={COLORS.header} bold>
          ⚡ Token Usage Summary
        </Text>
      </Box>

      <Box flexDirection="row" justifyContent="space-between" marginTop={0}>
        {/* Total tokens */}
        <Box flexDirection="column" alignItems="center" width="33%">
          <Text color={COLORS.dim}>Total</Text>
          <Text color={COLORS.total} bold>
            {formatTokens(totalTokens)}
          </Text>
        </Box>

        {/* Prompt tokens */}
        <Box flexDirection="column" alignItems="center" width="33%">
          <Text color={COLORS.dim}>Prompt</Text>
          <Text color={COLORS.prompt} bold>
            {formatTokens(totalPrompt)}
          </Text>
        </Box>

        {/* Completion tokens */}
        <Box flexDirection="column" alignItems="center" width="33%">
          <Text color={COLORS.dim}>Completion</Text>
          <Text color={COLORS.completion} bold>
            {formatTokens(totalCompletion)}
          </Text>
        </Box>
      </Box>

      {/* Provider breakdown mini-bars */}
      <Box marginTop={1} flexDirection="column">
        <Text color={COLORS.dim}>Provider Breakdown:</Text>
        <Box flexDirection="row" gap={2}>
          {providerBreakdown
            .filter((p) => p.tokens > 0)
            .map((p) => (
              <Box key={p.provider} flexDirection="row" gap={1}>
                <Text color={PROVIDER_STYLES[p.provider].color} bold>
                  {PROVIDER_STYLES[p.provider].name}
                </Text>
                <Text color={COLORS.muted}>{p.percent.toFixed(0)}%</Text>
              </Box>
            ))}
        </Box>
      </Box>
    </Box>
  );
};

// Main component
const TokenUsage = () => {
  const { models } = useSettingsStore();

  const { providerUsages, globalTotal, globalPrompt, globalCompletion } =
    useMemo(() => {
      let globalTotal = 0;
      let globalPrompt = 0;
      let globalCompletion = 0;

      // Group models by provider
      const grouped: Record<ProviderType, Model[]> = {
        groq: [],
        openrouter: [],
        ollama: [],
      };

      for (const model of models) {
        const provider = model.type || "ollama";
        grouped[provider].push(model);
        globalTotal += model.usage?.totalTokens ?? 0;
        globalPrompt += model.usage?.promptTokens ?? 0;
        globalCompletion += model.usage?.completionTokens ?? 0;
      }

      // Calculate provider usage
      const providerUsages: ProviderUsage[] = (
        ["groq", "openrouter", "ollama"] as ProviderType[]
      ).map((provider) => {
        const providerModels = grouped[provider];
        let totalPrompt = 0;
        let totalCompletion = 0;
        let totalTokens = 0;

        providerModels.forEach((m) => {
          totalPrompt += m.usage?.promptTokens ?? 0;
          totalCompletion += m.usage?.completionTokens ?? 0;
          totalTokens += m.usage?.totalTokens ?? 0;
        });

        const modelUsages: ModelUsage[] = providerModels
          .filter((m) => (m.usage?.totalTokens ?? 0) > 0)
          .map((m) => ({
            name: m.name,
            promptTokens: m.usage?.promptTokens ?? 0,
            completionTokens: m.usage?.completionTokens ?? 0,
            totalTokens: m.usage?.totalTokens ?? 0,
            percentOfProvider:
              totalTokens > 0
                ? ((m.usage?.totalTokens ?? 0) / totalTokens) * 100
                : 0,
            percentOfTotal:
              globalTotal > 0
                ? ((m.usage?.totalTokens ?? 0) / globalTotal) * 100
                : 0,
          }));

        return {
          provider,
          models: modelUsages,
          totalPrompt,
          totalCompletion,
          totalTokens,
        };
      });

      return { providerUsages, globalTotal, globalPrompt, globalCompletion };
    }, [models]);

  const providerBreakdown = providerUsages.map((p) => ({
    provider: p.provider,
    tokens: p.totalTokens,
    percent: globalTotal > 0 ? (p.totalTokens / globalTotal) * 100 : 0,
  }));

  const hasAnyUsage = globalTotal > 0;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Summary at top */}
      <SummaryCard
        totalTokens={globalTotal}
        totalPrompt={globalPrompt}
        totalCompletion={globalCompletion}
        providerBreakdown={providerBreakdown}
      />

      {/* Provider sections */}
      {hasAnyUsage ? (
        providerUsages.map((usage) => (
          <ProviderSection
            key={usage.provider}
            usage={usage}
            globalTotal={globalTotal}
          />
        ))
      ) : (
        <Box
          borderStyle="round"
          borderColor={COLORS.dim}
          paddingX={2}
          paddingY={1}
          justifyContent="center"
        >
          <Text color={COLORS.dim} italic>
            No token usage recorded yet. Start a conversation to track usage!
          </Text>
        </Box>
      )}

      {/* Legend */}
      <Box paddingX={1} marginTop={1} flexDirection="row" gap={2}>
        <Text>
          <Text color={COLORS.prompt}>■</Text>
          <Text color={COLORS.dim}> Prompt</Text>
        </Text>
        <Text>
          <Text color={COLORS.completion}>■</Text>
          <Text color={COLORS.dim}> Completion</Text>
        </Text>
        <Text>
          <Text color={COLORS.total}>■</Text>
          <Text color={COLORS.dim}> Total</Text>
        </Text>
      </Box>
    </Box>
  );
};

export default TokenUsage;
