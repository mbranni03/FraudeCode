import IntroComponent from "./IntroComponent";
import { Box, useInput } from "ink";
import useOllamaClient from "../hooks/useOllamaClient";
import OllamaClientComponent from "./OllamaClientComponent";
import { useState, useEffect } from "react";
import log from "../utils/logger";

const Session = ({ onDone }: { onDone: () => void }) => {
  const OllamaClient = useOllamaClient("llama3.1:latest");

  useInput((input, key) => {
    if (key.escape || input === "\u001b") {
      OllamaClient.interrupt();
    }
  });

  useEffect(() => {
    if (OllamaClient.status === 2 || OllamaClient.status === -1) {
      onDone();
    }
  }, [OllamaClient.status, onDone]);

  return <OllamaClientComponent OllamaClient={OllamaClient} />;
};

export default function App() {
  const [started, setStarted] = useState(false);
  const [sessions, setSessions] = useState([0]);
  log("App started");

  useInput((input, key) => {
    if (key.return) {
      setStarted(true);
    }
  });

  const handleDone = (index: number) => {
    if (index === sessions.length - 1) {
      setSessions((prev) => [...prev, prev.length]);
    }
  };

  return (
    <Box flexDirection="column">
      {!started && <IntroComponent />}
      {started &&
        sessions.map((key, index) => (
          <Session key={key} onDone={() => handleDone(index)} />
        ))}
    </Box>
  );
}
