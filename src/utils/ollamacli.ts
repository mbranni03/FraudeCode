import { useState, useCallback } from "react";

const OLLAMA_URL = "http://localhost:11434/api/chat";

export type TokenUsage = {
  total: number;
  prompt: number;
  completion: number;
};

export interface OllamaCLI {
  streamedText: string;
  status: number; // 0 = idle, 1 = loading, 2 = done
  tokenUsage: TokenUsage;
  completionQuery: (query: string) => Promise<void>;
}

export function useOllamaClient(model: string): OllamaCLI {
  const [streamedText, setStreamedText] = useState("");
  const [status, setStatus] = useState(0);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    total: 0,
    prompt: 0,
    completion: 0,
  });

  const completionQuery = useCallback(
    async (query: string) => {
      setStatus(1);
      setStreamedText(""); // Reset text for new query

      const payload = {
        model,
        stream: true,
        messages: [{ role: "user", content: query }],
        options: { temperature: 0.6 },
      };

      try {
        const response = await fetch(OLLAMA_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok || !response.body) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const jsonStrings = chunk.split("\n").filter((s) => s.trim() !== "");

          for (const jsonStr of jsonStrings) {
            try {
              const data = JSON.parse(jsonStr);
              const content = data.message?.content;

              if (content) {
                setStreamedText((prev) => prev + content);
              }

              if (data.done) {
                let prompt = data?.prompt_eval_count || 0;
                let completion = data?.eval_count || 0;
                let total = prompt + completion;
                setTokenUsage({
                  total,
                  prompt,
                  completion,
                });
                break;
              }
            } catch (e) {
              // Ignore malformed JSON chunks
            }
          }
        }
        setStatus(2);
      } catch (error) {
        console.error("Failed to stream response:", error);
        setStatus(2);
      }
    },
    [model]
  );

  return {
    streamedText,
    status,
    completionQuery,
    tokenUsage,
  };
}

export default useOllamaClient;
