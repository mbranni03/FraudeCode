import { Box, Text } from "ink";
import { useEffect, useMemo } from "react";
import {
  type Model,
  parseModelUniqueId,
  type ProviderType,
} from "@/types/Model";
import useSettingsStore from "@/store/useSettingsStore";

// Simplified Theme
const THEME = {
  active: "#34d399", // Emerald 400 - Success/Active
  primary: "#60a5fa", // Blue 400
  secondary: "#a78bfa", // Violet 400
  text: "white",
  dim: "gray",
  border: "gray",
};

const formatContext = (contextLength: number | undefined) => {
  if (!contextLength) return "";
  return `${(contextLength / 1000).toFixed(0)}k`;
};

/**
 * Check if a model matches a stored model reference.
 */
const modelMatchesReference = (model: Model, reference: string): boolean => {
  const parsed = parseModelUniqueId(reference);
  if (parsed) {
    return model.name === parsed.name && model.type === parsed.type;
  }
  return model.name === reference;
};

const ModelRow = ({
  model,
  isPrimary,
  isSecondary,
}: {
  model: Model;
  isPrimary: boolean;
  isSecondary: boolean;
}) => {
  const isActive = isPrimary || isSecondary;

  return (
    <Box flexDirection="row" gap={1}>
      <Box width={1}>{isActive && <Text color={THEME.active}>•</Text>}</Box>

      <Box flexGrow={1}>
        <Text color={isActive ? THEME.active : THEME.text} wrap="truncate-end">
          {model.name}
        </Text>
      </Box>

      {/* Tags */}
      <Box gap={1} flexShrink={0}>
        {/* Context Size */}
        {model.details?.context_length && (
          <Text color={THEME.dim}>
            {formatContext(model.details.context_length)}
          </Text>
        )}

        {isPrimary && (
          <Text color={THEME.primary} bold>
            PRI
          </Text>
        )}
        {isSecondary && (
          <Text color={THEME.secondary} bold>
            SEC
          </Text>
        )}
      </Box>
    </Box>
  );
};

const ProviderSection = ({
  provider,
  models,
  primaryModelRef,
  secondaryModelRef,
}: {
  provider: string;
  models: Model[];
  primaryModelRef: string;
  secondaryModelRef: string;
}) => {
  // Show all active models + up to 5 others
  const { visibleModels, hiddenCount } = useMemo(() => {
    const active: Model[] = [];
    const others: Model[] = [];

    models.forEach((m) => {
      const isPri = modelMatchesReference(m, primaryModelRef);
      const isSec = modelMatchesReference(m, secondaryModelRef);
      if (isPri || isSec) {
        active.push(m);
      } else {
        others.push(m);
      }
    });

    // Sort others alphabetically
    others.sort((a, b) => a.name.localeCompare(b.name));

    // Combine: Active first, then top 3 others
    // If we have very few active models, show more others to fill space, but let's keep it simple.
    // Let's just show up to 5 'others'.
    const visibleOthers = others.slice(0, 5);
    return {
      visibleModels: [...active, ...visibleOthers],
      hiddenCount: others.length - visibleOthers.length,
    };
  }, [models, primaryModelRef, secondaryModelRef]);

  if (models.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={THEME.dim} bold>
        {provider.toUpperCase()}
      </Text>
      {visibleModels.map((model) => (
        <ModelRow
          key={model.digest || `${model.type}-${model.name}`}
          model={model}
          isPrimary={modelMatchesReference(model, primaryModelRef)}
          isSecondary={modelMatchesReference(model, secondaryModelRef)}
        />
      ))}
      {hiddenCount > 0 && (
        <Box marginLeft={2}>
          <Text color={THEME.dim} italic>
            + {hiddenCount} more models...
          </Text>
        </Box>
      )}
    </Box>
  );
};

const CurrentConfig = ({
  primary,
  secondary,
}: {
  primary: string;
  secondary: string;
}) => (
  <Box
    flexDirection="column"
    marginBottom={1}
    borderStyle="round"
    borderColor={THEME.dim}
    paddingX={1}
  >
    <Box flexDirection="row" justifyContent="space-between">
      <Text color={THEME.primary} bold>
        Primary
      </Text>
      <Text>{primary}</Text>
    </Box>
    <Box flexDirection="row" justifyContent="space-between">
      <Text color={THEME.secondary} bold>
        Secondary
      </Text>
      <Text>{secondary}</Text>
    </Box>
  </Box>
);

const ModelList = () => {
  const { primaryModel, secondaryModel, models, syncWithSettings } =
    useSettingsStore();

  useEffect(() => {
    syncWithSettings();
  }, [syncWithSettings]);

  // Group models
  const groups = useMemo(() => {
    const g: Record<string, Model[]> = {};
    models.forEach((m) => {
      // Clean up provider name
      let type = (m.type || "ollama").toLowerCase();
      // Skip ollama embedding models
      if (
        type === "ollama" &&
        m.capabilities?.length === 1 &&
        m.capabilities[0] === "embedding"
      )
        return;

      if (!g[type]) g[type] = [];
      g[type].push(m);
    });
    return g;
  }, [models]);

  if (models.length === 0) {
    return <Text color={THEME.dim}>No models found.</Text>;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <CurrentConfig primary={primaryModel} secondary={secondaryModel} />

      <Box flexDirection="column">
        {Object.entries(groups).map(([provider, providerModels]) => (
          <ProviderSection
            key={provider}
            provider={provider}
            models={providerModels}
            primaryModelRef={primaryModel}
            secondaryModelRef={secondaryModel}
          />
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color={THEME.dim}>
          Use <Text color="white">/model &lt;name&gt;</Text> to switch
        </Text>
      </Box>
    </Box>
  );
};

export default ModelList;
