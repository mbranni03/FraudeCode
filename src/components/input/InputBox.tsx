import { useState, useMemo, useCallback, useEffect } from "react";
import { useApp, Box, Text, useInput } from "ink";
import { TextInput } from "@inkjs/ui";
import QueryHandler from "@/utils/queryHandler";
import useSettingsStore from "@/store/useSettingsStore";
import useFraudeStore from "@/store/useFraudeStore";
import CommandCenter from "@/commands";
import { addHistory } from "@/config/settings";
import CommandSuggestions from "./CommandSuggestions";
import FileSuggestions from "./FileSuggestions";
import { getFileSuggestions } from "@/utils/fileSuggestions";
import { shortenPath } from "@/utils";

const InputBoxComponent = () => {
  const { exit } = useApp();
  const [inputKey, setInputKey] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentInput, setCurrentInput] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    getFileSuggestions(process.cwd()).then(setAllFiles);
  }, []);

  const history = useSettingsStore((state) => state.history);
  const models = useSettingsStore((state) => state.models);
  const modelNames = useMemo(() => models.map((m) => m.name).sort(), [models]);
  const MAX_VISIBLE_SUGGESTIONS = 5;

  const suggestions = useMemo(() => {
    const allCommands = CommandCenter.getAllCommands();
    const suggestions = allCommands.map((s) => {
      if (s.usage.includes("<model-name>")) {
        const options = [];
        for (const modelName of modelNames) {
          const renderedUsage = s.usage.replace("<model-name>", modelName);
          options.push(renderedUsage);
        }
        return { ...s, renderedOptions: options };
      }
      return s;
    });
    return suggestions;
  }, [modelNames]);

  const fileTokenMatch = useMemo(
    () => currentInput.match(/@([^ ]*)$/),
    [currentInput],
  );
  const isFileMode = !!fileTokenMatch;
  const fileQuery = fileTokenMatch ? fileTokenMatch[1] : "";
  const filePrefix = fileTokenMatch
    ? currentInput.slice(0, fileTokenMatch.index! + 1)
    : "";

  const fileDropdownSuggestions = useMemo(() => {
    if (!isFileMode || !allFiles.length) return [];
    return allFiles.filter((f) =>
      f.toLowerCase().includes(fileQuery!.toLowerCase()),
    );
  }, [isFileMode, allFiles, fileQuery]);
  const dropdownSuggestions = useMemo(() => {
    if (!currentInput.startsWith("/")) return [];
    const filteredTemplates = suggestions
      .filter((s) => {
        if (s.renderedOptions && s.renderedOptions.length > 0) {
          const check = s.renderedOptions.find((option) => {
            return option.startsWith(currentInput);
          });
          return check != undefined;
        }
        return s.usage.startsWith(currentInput);
      })
      .slice(0, MAX_VISIBLE_SUGGESTIONS);
    if (
      filteredTemplates.length === 1 &&
      (filteredTemplates[0]?.usage.toLowerCase() ===
        currentInput.toLowerCase() ||
        filteredTemplates[0]?.renderedOptions?.find(
          (option) => option.toLowerCase() === currentInput.toLowerCase(),
        ))
    )
      return [];
    return filteredTemplates;
  }, [suggestions, currentInput]);

  const dynamicSuggestions = useMemo(() => {
    const allSuggestions = suggestions.flatMap((s) => {
      if (s.renderedOptions && s.renderedOptions.length > 0) {
        return s.renderedOptions;
      }
      return s.usage;
    });

    const dropdownSuggestion = dropdownSuggestions[selectedIndex];
    if (dropdownSuggestion) {
      // Put the dropdown suggestion first so it shows as ghost text
      const renderedSuggestion =
        dropdownSuggestion.renderedOptions &&
        dropdownSuggestion.renderedOptions.length > 0
          ? dropdownSuggestion.renderedOptions.find((option) =>
              option.startsWith(currentInput),
            )
          : dropdownSuggestion.usage;
      if (renderedSuggestion) {
        return [
          renderedSuggestion,
          ...allSuggestions.filter((s) => s !== renderedSuggestion),
        ];
      }
    }

    // File suggestions
    if (isFileMode && fileDropdownSuggestions.length > 0) {
      const selectedFile = fileDropdownSuggestions[selectedIndex];
      if (selectedFile) {
        return [filePrefix + selectedFile + " "];
      }
    }

    return allSuggestions;
  }, [
    suggestions,
    dropdownSuggestions,
    selectedIndex,
    currentInput,
    isFileMode,
    fileDropdownSuggestions,
    filePrefix,
  ]);

  // Calculate what ghost text the TextInput is ACTUALLY showing
  // This mirrors TextInput's internal logic: first suggestion that starts with input
  const actualGhostTextSuggestion = useMemo(() => {
    if (currentInput.length === 0) return null;
    const match = dynamicSuggestions.find((s) => s.startsWith(currentInput));
    if (!match) return null;
    return match.replace(/<[^>]+>.*$/, "");
  }, [currentInput, dynamicSuggestions]);

  useInput((input, key) => {
    if (key.tab) {
      if (
        actualGhostTextSuggestion &&
        actualGhostTextSuggestion.toLowerCase() != currentInput.toLowerCase()
      ) {
        setCurrentInput(actualGhostTextSuggestion);
        setInputKey((k) => k + 1);
        setHistoryIndex(-1);
      } else {
        useFraudeStore.setState({
          executionMode: ((useFraudeStore.getState().executionMode + 1) % 3) as
            | 0
            | 1
            | 2,
        });
      }
      return;
    }

    // If input starts with "/" and there are multiple suggestions, use arrow keys for command dropdown
    if (currentInput.startsWith("/") && dropdownSuggestions.length > 1) {
      if (key.upArrow) {
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : dropdownSuggestions.length - 1,
        );
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((prev) =>
          prev < dropdownSuggestions.length - 1 ? prev + 1 : 0,
        );
        return;
      }
    }

    // Input starts with @ (or contains @ at end)
    if (isFileMode && fileDropdownSuggestions.length > 1) {
      const listLen = fileDropdownSuggestions.length;
      if (key.upArrow) {
        const newIndex = selectedIndex > 0 ? selectedIndex - 1 : listLen - 1;
        setSelectedIndex(newIndex);
        if (newIndex < scrollOffset) {
          setScrollOffset(newIndex);
        } else if (newIndex >= scrollOffset + MAX_VISIBLE_SUGGESTIONS) {
          setScrollOffset(newIndex - MAX_VISIBLE_SUGGESTIONS + 1);
        }
        return;
      }
      if (key.downArrow) {
        const newIndex = selectedIndex < listLen - 1 ? selectedIndex + 1 : 0;
        setSelectedIndex(newIndex);
        if (newIndex >= scrollOffset + MAX_VISIBLE_SUGGESTIONS) {
          setScrollOffset(newIndex - MAX_VISIBLE_SUGGESTIONS + 1);
        } else if (newIndex < scrollOffset) {
          setScrollOffset(newIndex);
        }
        return;
      }
    }

    // // Otherwise, use arrow keys for history navigation
    // // Note: history[0] is the most recent item in useFraudeStore
    if (key.upArrow && history.length > 0) {
      const newIndex =
        historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(newIndex);
      const historyItem = history[newIndex];
      if (historyItem) {
        setCurrentInput(historyItem);
        setInputKey((k) => k + 1);
      }
      return;
    }
    // Down arrow: go to newer history or clear input
    if (key.downArrow) {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        const historyItem = history[newIndex];
        if (historyItem) {
          setCurrentInput(historyItem);
          setInputKey((k) => k + 1);
        }
      } else {
        // Clear input when at the end of history or not in history
        setHistoryIndex(-1);
        setCurrentInput("");
        setInputKey((k) => k + 1);
      }
      return;
    }
  });

  const handleChange = useCallback((value: string) => {
    setCurrentInput(value);
    setSelectedIndex(0);
    setScrollOffset(0);
  }, []);

  const processSubmit = () => {
    const v = currentInput;
    if (v.trim().toLowerCase() === "exit") {
      exit();
      return;
    }
    if (v.trim() === "") return;
    addHistory(v);
    setCurrentInput("");
    setInputKey((k) => k + 1); // Clear input by remounting TextInput
    QueryHandler(v);
  };

  const getExecutionMode = (mode: 0 | 1 | 2) => {
    switch (mode) {
      case 0:
        return "Fast";
      case 1:
        return "Planning";
      case 2:
        return "Ask";
    }
  };

  const status = useFraudeStore((state) => state.status);
  if (status === 3) return null;

  return (
    <Box flexDirection="column" padding={1}>
      <Text>Type something and press enter or type "exit" to exit:</Text>
      <Box borderStyle="round" borderColor="white" paddingX={1} width={70}>
        <Text bold>&gt; </Text>
        <Box flexGrow={1}>
          <TextInput
            key={inputKey}
            placeholder="Enter command or query..."
            onChange={handleChange}
            suggestions={dynamicSuggestions}
            defaultValue={currentInput}
            onSubmit={processSubmit}
          />
        </Box>
      </Box>
      {dropdownSuggestions.length > 0 ? (
        <CommandSuggestions
          selectedIndex={selectedIndex}
          filteredTemplates={dropdownSuggestions}
        />
      ) : (
        <Box width={70} justifyContent="space-between" paddingX={1}>
          {fileDropdownSuggestions.length > 0 ? (
            <FileSuggestions
              selectedIndex={selectedIndex - scrollOffset}
              suggestions={fileDropdownSuggestions.slice(
                scrollOffset,
                scrollOffset + MAX_VISIBLE_SUGGESTIONS,
              )}
            />
          ) : (
            <>
              <Text color="gray">{shortenPath(process.cwd())}</Text>
              <Text color="cyan">
                <Text bold>
                  {getExecutionMode(useFraudeStore.getState().executionMode)}{" "}
                  (Tab to Change)
                </Text>
              </Text>
            </>
          )}
        </Box>
      )}
    </Box>
  );
};

export default InputBoxComponent;
