import { Box, Text } from "ink";
import { useMemo } from "react";
import { type Model, type ProviderType, ProviderTypes } from "@/types/Model";
import useSettingsStore from "@/store/useSettingsStore";
import log from "@/utils/logger";

import { THEME as SHARED_THEME } from "@/theme";

// Minimalist Theme mapped to Shared Theme
const THEME = {
  text: SHARED_THEME.text,
  dim: SHARED_THEME.dim,
  accent: SHARED_THEME.primaryLight,
  error: SHARED_THEME.error,
  header: SHARED_THEME.text,
  barFilled: SHARED_THEME.primary,
  barEmpty: SHARED_THEME.border,
};

// Format token count with K/M suffix (Compact)
const formatTokens = (tokens: number): string => {
  if (tokens === 0) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return tokens.toLocaleString();
};

interface ModelUsage {
  name: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  percentOfProvider: number;
}

interface ProviderUsage {
  provider: ProviderType;
  models: ModelUsage[];
  totalTokens: number;
  percentOfTotal: number;
}

const ProgressBar = ({
  percent,
  width = 15,
}: {
  percent: number;
  width?: number;
}) => {
  const safePercent = Math.min(100, Math.max(0, percent));
  const filled = Math.round((safePercent / 100) * width);
  const empty = width - filled;

  return (
    <Text>
      <Text color={THEME.barFilled}>{"━".repeat(filled)}</Text>
      <Text color={THEME.barEmpty}>{"─".repeat(empty)}</Text>
    </Text>
  );
};

// Unified Column Widths
const COL_WIDTHS = {
  NAME: 24,
  BAR: 18, // Widen for bar + text
  TOTAL: 10,
  BREAKDOWN: 24,
};

const HeaderRow = () => (
  <Box flexDirection="row" gap={2} marginBottom={0}>
    <Box width={COL_WIDTHS.NAME}>
      <Text color={THEME.dim}>Model Name</Text>
    </Box>
    <Box width={COL_WIDTHS.BAR}>
      <Text color={THEME.dim}>% of Provider</Text>
    </Box>
    <Box width={COL_WIDTHS.TOTAL} justifyContent="flex-end">
      <Text color={THEME.dim}>Total</Text>
    </Box>
    <Box width={COL_WIDTHS.BREAKDOWN} justifyContent="flex-end">
      <Text color={THEME.dim}>Breakdown</Text>
    </Box>
  </Box>
);

const ModelRow = ({ model }: { model: ModelUsage }) => {
  return (
    <Box flexDirection="row" gap={2}>
      {/* Name */}
      <Box width={COL_WIDTHS.NAME}>
        <Text color={THEME.text} wrap="truncate-end">
          {model.name}
        </Text>
      </Box>

      {/* Bar */}
      <Box width={COL_WIDTHS.BAR} flexDirection="row" gap={1}>
        <ProgressBar percent={model.percentOfProvider} width={8} />
        <Text color={THEME.dim}>{model.percentOfProvider.toFixed(0)}%</Text>
      </Box>

      {/* Total */}
      <Box width={COL_WIDTHS.TOTAL} justifyContent="flex-end">
        <Text color={THEME.text} bold>
          {formatTokens(model.totalTokens)}
        </Text>
      </Box>

      {/* Breakdown */}
      <Box width={COL_WIDTHS.BREAKDOWN} justifyContent="flex-end">
        <Text color={THEME.dim}>
          P: {formatTokens(model.promptTokens)} · C:{" "}
          {formatTokens(model.completionTokens)}
        </Text>
      </Box>
    </Box>
  );
};

const ProviderSection = ({ usage }: { usage: ProviderUsage }) => {
  if (usage.totalTokens === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={0}>
        <Text bold color={THEME.header}>
          {usage.provider.toUpperCase()}
          <Text color={THEME.dim}>
            {" "}
            · {usage.percentOfTotal.toFixed(1)}% of all usage
          </Text>
        </Text>
      </Box>

      {/* Column Headers for this section */}
      <HeaderRow />

      <Box flexDirection="column">
        {usage.models
          .sort((a, b) => b.totalTokens - a.totalTokens)
          .map((model) => (
            <ModelRow key={model.name} model={model} />
          ))}
      </Box>
    </Box>
  );
};

const TokenUsage = () => {
  const { models } = useSettingsStore();
  log(JSON.stringify(models, null, 2));

  const stats = useMemo(() => {
    let globalTotal = 0;
    let globalPrompt = 0;
    let globalCompletion = 0;

    const grouped: Record<ProviderType, Model[]> = {} as Record<
      ProviderType,
      Model[]
    >;
    ProviderTypes.forEach((p) => (grouped[p] = []));

    // Aggregate
    for (const model of models) {
      const provider = model.type || "ollama";
      if (!grouped[provider]) grouped[provider] = []; // Safety
      grouped[provider].push(model);

      const u = model.usage || {
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
      };
      globalTotal += u.totalTokens;
      globalPrompt += u.promptTokens;
      globalCompletion += u.completionTokens;
    }

    // Process per provider
    const providers: ProviderUsage[] = ProviderTypes.map((provider) => {
      const pModels = grouped[provider] || [];
      let pTotal = 0;

      const mUsages: ModelUsage[] = pModels
        .filter((m) => (m.usage?.totalTokens ?? 0) > 0)
        .map((m) => {
          const t = m.usage?.totalTokens ?? 0;
          pTotal += t;
          return {
            name: m.name,
            totalTokens: t,
            promptTokens: m.usage?.promptTokens ?? 0,
            completionTokens: m.usage?.completionTokens ?? 0,
            percentOfProvider: 0, // Calc later
          };
        });

      // Calc percents
      mUsages.forEach(
        (m) =>
          (m.percentOfProvider =
            pTotal > 0 ? (m.totalTokens / pTotal) * 100 : 0),
      );

      return {
        provider,
        models: mUsages,
        totalTokens: pTotal,
        percentOfTotal: globalTotal > 0 ? (pTotal / globalTotal) * 100 : 0,
      };
    })
      .filter((p) => p.totalTokens > 0)
      .sort((a, b) => b.totalTokens - a.totalTokens);

    return { globalTotal, globalPrompt, globalCompletion, providers };
  }, [models]);

  if (stats.globalTotal === 0) {
    return (
      <Box padding={1}>
        <Text color={THEME.dim}>
          No token usage data available. Start a chat to see stats!
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Header Stats */}
      <Box
        borderStyle="single"
        borderColor={THEME.dim}
        paddingX={1}
        marginBottom={1}
        justifyContent="space-between"
      >
        <Text color={THEME.header} bold>
          USAGE STATS
        </Text>
        <Box gap={2}>
          <Text>
            TOTAL:{" "}
            <Text color={SHARED_THEME.primary} bold>
              {formatTokens(stats.globalTotal)}
            </Text>
          </Text>
          <Text color={THEME.dim}>P: {formatTokens(stats.globalPrompt)}</Text>
          <Text color={THEME.dim}>
            C: {formatTokens(stats.globalCompletion)}
          </Text>
        </Box>
      </Box>

      {/* Provider Lists */}
      {stats.providers.map((p) => (
        <ProviderSection key={p.provider} usage={p} />
      ))}

      {/* Legend Footer */}
      <Box marginTop={1} paddingX={1} flexDirection="column">
        <Text color={THEME.dim} italic>
          • P / C = Prompt vs Completion tokens
        </Text>
        <Text color={THEME.dim} italic>
          • % of Provider = How much this model contributed to that provider's
          total cost/usage
        </Text>
      </Box>
    </Box>
  );
};

export default TokenUsage;
