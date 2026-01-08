import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { getOllamaModels } from "../../services/llm";
import { useSettingsStore } from "../../store/settingsStore";
import type { Model } from "../../utils/Settings";

const ACCENT_ORANGE = "#FF8C00"; // rgb(255, 140, 0)
const ACCENT_PINK = "#FF69B4"; // rgb(255, 105, 180)

const ModelItem = () => {};

const ModelList = () => {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { thinkerModel, generalModel, scoutModel } = useSettingsStore();

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const data = await getOllamaModels();
        setModels(data);
        setError(null);
      } catch (err: any) {
        setError(err.message || "Failed to connect to Ollama. Is it running?");
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getModelRoles = (name: string) => {
    const roles = [];
    if (name.includes(thinkerModel)) roles.push("Reasoning");
    if (name.includes(generalModel)) roles.push("General");
    if (name.includes(scoutModel)) roles.push("Light-weight");
    return roles;
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Groq Models</Text>
      <Box
        borderStyle="round"
        borderColor="white"
        flexDirection="column"
        paddingX={1}
        marginBottom={1}
      >
        <Text color="gray">No models found in Groq library.</Text>
      </Box>
      <Text bold>OpenRouter Models</Text>
      <Box
        borderStyle="round"
        borderColor="white"
        flexDirection="column"
        paddingX={1}
        marginBottom={1}
      >
        <Text color="gray">No models found in OpenRouter library.</Text>
      </Box>
      <Text bold>Ollama Models</Text>
      <Box
        borderStyle="round"
        borderColor="white"
        flexDirection="column"
        paddingX={1}
      >
        {loading ? (
          <Text color="gray">⟳ Checking Ollama connection...</Text>
        ) : error ? (
          <Box flexDirection="column">
            <Text color="red" bold>
              ⚠ Error Connection Failed
            </Text>
            <Text color="red">{error}</Text>
          </Box>
        ) : models.length === 0 ? (
          <Text color="gray">No models found in Ollama library.</Text>
        ) : (
          models.map((model) => {
            const roles = getModelRoles(model.name);
            const active = roles.length > 0;

            return (
              <Box
                key={model.digest}
                flexDirection="row"
                justifyContent="space-between"
                paddingY={0}
              >
                <Box flexDirection="row" flexGrow={1} flexShrink={1}>
                  <Text color={active ? ACCENT_ORANGE : "white"}>
                    {active ? "● " : "○ "}
                  </Text>
                  <Text
                    color={active ? ACCENT_ORANGE : "white"}
                    bold={active}
                    wrap="truncate-end"
                  >
                    {model.name}
                    {active && (
                      <Text color="white" dimColor>
                        {" "}
                        ({roles.join(", ")})
                      </Text>
                    )}
                  </Text>
                </Box>

                <Box flexDirection="row" gap={2} flexShrink={0} marginLeft={2}>
                  <Text color="gray">{formatSize(model?.size || 0)}</Text>
                </Box>
              </Box>
            );
          })
        )}
      </Box>
      <Box flexDirection="row" justifyContent="space-between">
        <Text>
          <Text color={ACCENT_ORANGE}>●</Text>
          <Text color="gray"> In use</Text>
        </Text>
      </Box>
      <Box paddingY={1}>
        <Text>
          To switch models, use:{" "}
          <Text color={ACCENT_PINK}>/model &lt;model-name&gt;</Text>
        </Text>
      </Box>
    </Box>
  );
};

export default ModelList;
