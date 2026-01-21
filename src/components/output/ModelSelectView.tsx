import { Box, Text } from "ink";
import { Select } from "@inkjs/ui";
import React from "react";
import useSettingsStore from "@/store/useSettingsStore";
import useFraudeStore from "@/store/useFraudeStore";

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
      borderStyle="round"
      borderColor="yellow"
      padding={1}
    >
      <Text bold color="yellow">
        ⚠ Rate Limit Exceeded - Select Alternative Model
      </Text>
      <Box marginY={1} flexDirection="column">
        <Text>
          The model{" "}
          <Text bold color="red">
            {originalModel}
          </Text>{" "}
          has hit its rate limit after multiple retries.
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor wrap="wrap">
          Error: {errorMessage.slice(0, 200)}
          {errorMessage.length > 200 ? "..." : ""}
        </Text>
      </Box>
      <Text>Select an alternative model to continue, or cancel:</Text>
      <Box marginTop={1}>
        <Select options={options} onChange={handleSelect} />
      </Box>
    </Box>
  );
}
