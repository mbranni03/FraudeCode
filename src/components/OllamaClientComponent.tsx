import { Box, Text } from "ink";
import type { OllamaCLI } from "../utils/ollamacli";
import LoaderComponent from "./LoaderComponent";
import InputBoxComponent from "./InputBoxComponent";

const OllamaClientComponent = ({
  OllamaClient,
}: {
  OllamaClient: OllamaCLI;
}) => {
  return (
    <Box flexDirection="column">
      <Text>{OllamaClient.streamedText}</Text>
      {OllamaClient.status !== 0 && (
        <LoaderComponent
          status={OllamaClient.status}
          tokenUsage={OllamaClient.tokenUsage}
        />
      )}
      {OllamaClient.status === 0 && (
        <InputBoxComponent OllamaClient={OllamaClient} />
      )}
    </Box>
  );
};

export default OllamaClientComponent;
