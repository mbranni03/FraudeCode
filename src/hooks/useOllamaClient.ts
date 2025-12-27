import { useState, useCallback, useRef, useEffect } from "react";
import summarizeProject from "../core/actions/summarize_project";
import Neo4jClient from "../services/neo4j";
import QdrantCli from "../services/qdrant";
import type { PendingChange } from "../types/state";
import langgraphModify from "../core/actions/langgraph_modify";
import { thinkerModel, coderModel, OLLAMA_BASE_URL } from "../services/llm";

const neo4j = new Neo4jClient();
const qdrant = new QdrantCli();
qdrant
  .init()
  .catch((err) => console.error("Failed to initialize Qdrant:", err));

export type TokenUsage = {
  total: number;
  prompt: number;
  completion: number;
};

export type OutputItemType =
  | "log"
  | "markdown"
  | "diff"
  | "confirmation"
  | "command";

export interface OutputItem {
  id: string;
  type: OutputItemType;
  content: string;
  title?: string;
  changes?: PendingChange[];
}

export interface OllamaCLI {
  outputItems: OutputItem[];
  status: number; // 0 = idle, 1 = loading, 2 = done, -1 = interrupted, 3 = awaiting confirmation
  tokenUsage: TokenUsage;
  handleQuery: (query: string) => Promise<void>;
  interrupt: () => void;
  embedString: (query: string) => Promise<number[]>;
  confirmModification: (confirmed: boolean) => void;
  pendingConfirmation: boolean;
  pendingChanges: PendingChange[];
  updateOutput: (
    type: OutputItemType,
    content: string,
    title?: string,
    changes?: PendingChange[]
  ) => void;
  neo4j: Neo4jClient;
  qdrant: QdrantCli;
}

export function useOllamaClient(model: string): OllamaCLI {
  const [outputItems, setOutputItems] = useState<OutputItem[]>([]);
  const [status, setStatus] = useState(0);
  const [tokenUsage] = useState<TokenUsage>({
    total: 0,
    prompt: 0,
    completion: 0,
  });
  const abortRef = useRef<AbortController | null>(null);
  const confirmationResolverRef = useRef<((confirmed: boolean) => void) | null>(
    null
  );
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);

  const updateOutput = useCallback(
    (
      type: OutputItemType,
      content: string,
      title?: string,
      changes?: PendingChange[]
    ) => {
      setOutputItems((prev) => {
        const last = prev[prev.length - 1];
        if (
          last &&
          last.type === type &&
          last.type !== "log" &&
          last.title === title
        ) {
          return [...prev.slice(0, -1), { ...last, content, changes }];
        } else {
          return [
            ...prev,
            { id: crypto.randomUUID(), type, content, title, changes },
          ];
        }
      });
    },
    []
  );

  const promptUserConfirmation = (): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmationResolverRef.current = resolve;
      setPendingConfirmation(true);
      setStatus(3);
    });
  };

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const handleQuery = useCallback(
    async (query: string) => {
      try {
        setStatus(1);
        setOutputItems([]);
        updateOutput("command", query);

        if (query.trim() === "/summarize") {
          // await summarizeProject(neo4j, qdrant, updateOutput);
          setStatus(2);
        } else if (query.trim().startsWith("/modify")) {
          const prompt = query.trim().split(" ").slice(1).join(" ") || "";
          if (prompt.length === 0) {
            setStatus(2);
            updateOutput("log", "No prompt provided");
            return;
          } else {
            if (abortRef.current) {
              abortRef.current.abort();
            }
            abortRef.current = new AbortController();

            await langgraphModify(
              prompt,
              neo4j,
              qdrant,
              thinkerModel,
              coderModel,
              updateOutput,
              promptUserConfirmation,
              setPendingChanges,
              abortRef.current.signal
            );
            setPendingConfirmation(false);
            setStatus(2);
          }
        } else {
          setStatus(2);
          updateOutput("log", "Command not found");
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error("[ERROR] ", error);
        }
      }
    },
    [updateOutput]
  );

  const interrupt = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus(-1);
  }, []);

  const embedString = useCallback(async (query: string) => {
    return await qdrant.embed(query);
  }, []);

  const confirmModification = useCallback((confirmed: boolean) => {
    if (confirmationResolverRef.current) {
      confirmationResolverRef.current(confirmed);
      confirmationResolverRef.current = null;
      setPendingConfirmation(false);
    }
  }, []);

  return {
    outputItems,
    status,
    handleQuery,
    tokenUsage,
    interrupt,
    embedString,
    confirmModification,
    pendingConfirmation,
    pendingChanges,
    updateOutput,
    neo4j,
    qdrant,
  };
}

export default useOllamaClient;
