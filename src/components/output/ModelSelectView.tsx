import { Box, Text } from "ink";
import { Select } from "@inkjs/ui";
import React from "react";
import useSettingsStore from "@/store/useSettingsStore";
import useFraudeStore from "@/store/useFraudeStore";
import { THEME } from "@/theme";

export default function ModelSelectView() {
  const { models } = useSettingsStore();
  const pendingSelection = useFraudeStore(
    (state) => state.pendingModelSelection,
  );
  const resolveModelSelection = useFraudeStore(
    (state) => state.resolveModelSelection,
  );

  if (!pendingSelection) {
    return null;
  }

  const { originalModel, errorMessage } = pendingSelection;

  // Filter out the model that failed and get available alternatives
  const availableModels = models.filter((m) => m.name !== originalModel);

  const options = [
    { label: "✗ Cancel (abort the request)", value: "__cancel__" },
    ...availableModels.map((model) => ({
      label: `→ ${model.name} (${model.type})`,
      value: model.name,
    })),
  ];

  const handleSelect = (value: string) => {
    if (value === "__cancel__") {
      resolveModelSelection(null);
    } else {
      resolveModelSelection(value);
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={THEME.warning}
      paddingX={1}
    >
      <Text color={THEME.warning}>⚠ Rate Limit Exceeded</Text>
      <Box marginY={1} flexDirection="column">
        <Text>
          Model{" "}
          <Text bold color={THEME.error}>
            {originalModel}
          </Text>{" "}
          hit its rate limit.
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor wrap="wrap">
          {errorMessage.slice(0, 150)}
          {errorMessage.length > 150 ? "..." : ""}
        </Text>
      </Box>
      <Text>Select an alternative model:</Text>
      <Box marginTop={0}>
        <Select options={options} onChange={handleSelect} />
      </Box>
    </Box>
  );
}
