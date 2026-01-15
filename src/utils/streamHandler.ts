import useFraudeStore from "@/store/useFraudeStore";
import log from "./logger";

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

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function handleStreamChunk(chunk: Record<string, unknown>): void {
  const { updateOutput } = useFraudeStore.getState();
  const store = useFraudeStore.getState();

  log(`Stream chunk: ${JSON.stringify(chunk)}`);

  switch (chunk.type) {
    case "start":
      resetState();
      break;

    case "reasoning-start":
      state.reasoningText = "";
      useFraudeStore.setState({ lastBreak: store.elapsedTime });
      break;

    case "reasoning-delta":
      state.reasoningText += chunk.text as string;
      updateOutput("reasoning", state.reasoningText);
      break;

    case "reasoning-end": {
      const elapsed = store.elapsedTime - store.lastBreak;
      const duration = formatDuration(elapsed * 100); // elapsed is in 100ms units
      updateOutput("reasoning", `${state.reasoningText} · (${duration})`);
      useFraudeStore.setState({ lastBreak: store.elapsedTime });
      break;
    }

    // case "tool-call": {
    //   const toolCallId = chunk.toolCallId as string;
    //   state.currentToolCallId = toolCallId;
    //   state.toolCallTimestamps.set(toolCallId, store.elapsedTime);
    //   break;
    // }

    // case "tool-result": {
    //   const toolCallId = chunk.toolCallId as string;
    //   const startTime =
    //     state.toolCallTimestamps.get(toolCallId) || store.lastBreak;
    //   const elapsed = store.elapsedTime - startTime;
    //   const duration = formatDuration(elapsed * 100);

    //   useFraudeStore.setState({ lastBreak: store.elapsedTime });
    //   state.toolCallTimestamps.delete(toolCallId);
    //   break;
    // }

    case "text-delta":
      state.agentText += chunk.text as string;
      updateOutput("agentText", state.agentText);
      break;

    case "finish-step": {
      const finishReason = chunk.finishReason as string;
      if (finishReason === "stop" && state.agentText) {
        // Final text output is already displayed
      }
      break;
    }

    case "finish": {
      const elapsed = store.elapsedTime;
      updateOutput("done", `Done · (${formatDuration(elapsed * 100)} total)`);
      resetState();
      break;
    }

    default:
      // Ignore other chunk types (start-step, tool-input-*, etc.)
      break;
  }
}

export function resetStreamState() {
  resetState();
}
