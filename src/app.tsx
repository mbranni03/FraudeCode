import IntroComponent from "./components/IntroComponent";
import { Box } from "ink";
import useOllamaClient from "./utils/ollamacli";
import OllamaClientComponent from "./components/OllamaClientComponent";

export default function App() {
  const OllamaClient = useOllamaClient("tinyllama:latest");

  return (
    <Box flexDirection="column">
      <IntroComponent />
      <OllamaClientComponent OllamaClient={OllamaClient} />
    </Box>
  );
}
