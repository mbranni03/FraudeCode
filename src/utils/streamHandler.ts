import useFraudeStore from "@/store/useFraudeStore";
import log from "./logger";
import { UpdateSettings } from "@/config/settings";
import type { TokenUsage } from "@/types/TokenUsage";

interface StreamState {
  reasoningText: string;
  agentText: string;
  currentToolCallId: string | null;
  toolCallTimestamps: Map<string, number>;
}

const state: StreamState = {
  reasoningText: "",
  agentText: "",
  currentToolCallId: null,
  toolCallTimestamps: new Map(),
};

function resetState() {
  state.reasoningText = "";
  state.agentText = "";
  state.currentToolCallId = null;
  state.toolCallTimestamps.clear();
}

function formatDuration(ms: number): number {
  return ms / 1000;
}

export function handleStreamChunk(chunk: Record<string, unknown>): TokenUsage {
  const { updateOutput } = useFraudeStore.getState();
  const store = useFraudeStore.getState();

  // log(`Stream chunk: ${JSON.stringify(chunk)}`);

  switch (chunk.type) {
    case "start":
      resetState();
      break;

    case "reasoning-start":
      state.reasoningText = "";
      useFraudeStore.setState({ lastBreak: store.elapsedTime });
      updateOutput("reasoning", "", { dontOverride: true });
      break;

    case "reasoning-delta":
      state.reasoningText += chunk.text as string;
      updateOutput("reasoning", state.reasoningText);
      break;

    case "reasoning-end": {
      const elapsed = store.elapsedTime - store.lastBreak;
      const duration = formatDuration(elapsed * 100);
      updateOutput("reasoning", `${state.reasoningText}`, { duration });
      useFraudeStore.setState({ lastBreak: store.elapsedTime });
      break;
    }

    case "text-delta":
      const lastItem = store.outputItems[store.outputItems.length - 1];
      if (lastItem?.type === "toolCall") {
        state.agentText = "";
      }
      state.agentText += chunk.text as string;
      updateOutput("agentText", state.agentText);
      break;

    case "finish-step": {
      const finishReason = chunk.finishReason as string;
      if (finishReason === "stop" && state.agentText) {
        // Final text output is already displayed
      }
      const usage = (
        chunk.usage as {
          raw: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
          };
        }
      ).raw;
      return {
        prompt: usage.prompt_tokens,
        completion: usage.completion_tokens,
        total: usage.total_tokens,
      };
    }

    case "finish": {
      const elapsed = store.elapsedTime;
      updateOutput(
        "done",
        `Finished in ${formatDuration(elapsed * 100).toFixed(1)}s`,
      );
      resetState();
      break;
    }

    case "error": {
      const error = chunk.error as Error;
      updateOutput("error", error.message);
      break;
    }

    default:
      // Ignore other chunk types (start-step, tool-input-*, etc.)
      break;
  }
  return {
    prompt: 0,
    completion: 0,
    total: 0,
  };
}

export function resetStreamState() {
  resetState();
}
