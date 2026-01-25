import { Box, Text } from "ink";
import { Select, TextInput } from "@inkjs/ui";
import React, { useState, useMemo } from "react";
import pendingChanges from "@/agent/pendingChanges";
import DiffView from "./DiffView";
import QueryHandler from "@/utils/queryHandler";
import { projectPath } from "@/utils";
import { type PendingChange } from "@/agent/pendingChanges";

import useFraudeStore from "@/store/useFraudeStore";
import { THEME } from "@/theme";

export default function ConfirmationView() {
  const [status, setStatus] = useState<
    "pending" | "applied" | "rejected" | "viewing_file" | "revising"
  >("pending");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Get grouped changes directly from manager
  const groupedChanges = useMemo(
    () => pendingChanges.getAllChangesGrouped(),
    [],
  );
  const filePaths = Object.keys(groupedChanges);

  const handleMainSelect = (value: string) => {
    if (value === "apply_all") {
      pendingChanges.applyAll().then(() => {
        setStatus("applied");
        useFraudeStore.setState({ status: 0, statusText: "" });
      });
    } else if (value === "reject_all") {
      pendingChanges.rejectAll();
      setStatus("rejected");
      useFraudeStore.setState({ status: 0, statusText: "" });
    } else if (value.startsWith("view_")) {
      const path = value.replace("view_", "");
      setSelectedFile(path);
      setStatus("viewing_file");
    }
  };

  const handleFileAction = (value: string) => {
    if (value === "back") {
      setSelectedFile(null);
      setStatus("pending");
    }
  };

  if (status === "applied") {
    return (
      <Box borderStyle="single" borderColor={THEME.success} paddingX={1}>
        <Text color={THEME.success}>✓ Changes applied</Text>
      </Box>
    );
  }

  if (status === "rejected") {
    return (
      <Box borderStyle="single" borderColor={THEME.error} paddingX={1}>
        <Text color={THEME.error}>✗ Changes rejected</Text>
      </Box>
    );
  }

  // View specific file details
  if (status === "viewing_file" && selectedFile) {
    const changes = groupedChanges[selectedFile];

    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={THEME.border}
        paddingX={1}
      >
        <Text bold color={THEME.primary}>
          {projectPath(selectedFile)}
        </Text>
        <Box flexDirection="column" marginY={0}>
          {changes?.map((change) => (
            <Box key={change.id} flexDirection="column">
              <Text color={THEME.dim}>Type: {change.type}</Text>
              <DiffView patches={[change.diff]} />
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Select
            options={[{ label: "← Back", value: "back" }]}
            onChange={handleFileAction}
          />
        </Box>
      </Box>
    );
  }

  // Handle revision feedback
  if (status === "revising") {
    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={THEME.primary}
        paddingX={1}
      >
        <Text bold color={THEME.primary}>
          Request Revision
        </Text>
        <Text dimColor>Enter feedback to guide the agent:</Text>
        <Box marginTop={1}>
          <TextInput
            onSubmit={(value) => {
              if (!value.trim()) return;
              useFraudeStore.setState({
                status: 1,
                statusText: "Revising...",
              });
              pendingChanges.clear();
              QueryHandler(`Revising changes: ${value}`);
            }}
            placeholder="What should be changed?"
          />
        </Box>
      </Box>
    );
  }

  // Main Summary View
  const options = [
    { label: "✓ Apply All Changes", value: "apply_all" },
    { label: "✗ Reject All Changes", value: "reject_all" },
    { label: "Request Revision", value: "revise_all" },
    // Add options to inspect specific files
    ...filePaths.map((path) => ({
      label: `Review ${projectPath(path)}`,
      value: `view_${path}`,
    })),
  ];

  return (
    <Box flexDirection="column">
      <Text bold color={THEME.primary}>
        Pending Changes
      </Text>
      <Box flexDirection="column" marginY={0}>
        {filePaths.map((path) => {
          const changes = groupedChanges[path];
          const type = changes?.[0]?.type || "unknown";
          const patches = changes?.map((c) => c.diff) || [];

          return (
            <Box key={path} flexDirection="column" marginTop={1}>
              <Text>
                {projectPath(path)} <Text color={THEME.dim}>({type})</Text>
              </Text>
              <Box paddingLeft={2}>
                <DiffView patches={patches} />
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={THEME.dim}>Select action:</Text>
        <Select
          options={options}
          onChange={(value) => {
            if (value === "revise_all") {
              setStatus("revising");
            } else {
              handleMainSelect(value);
            }
          }}
        />
      </Box>
    </Box>
  );
}
