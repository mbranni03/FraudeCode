import useFraudeStore from "@/store/useFraudeStore";
import CommandCenter from "@/commands";
import { Agent } from "@/agent";
import log from "./logger";
import { handleStreamChunk, resetStreamState } from "./streamHandler";
import pendingChanges from "@/agent/pendingChanges";
import useSettingsStore from "@/store/useSettingsStore";
import { incrementModelUsage } from "@/config/settings";
import type { TokenUsage } from "@/types/TokenUsage";

const { updateOutput } = useFraudeStore.getState();

export default async function QueryHandler(query: string) {
  if (query === "exit") {
    process.exit(0);
  }
  updateOutput("command", query);
  if (query.startsWith("/")) {
    await CommandCenter.processCommand(query);
    return;
  }
  log(`User Query: ${query}`);

  // Create an AbortController for this query
  const abortController = new AbortController();
  useFraudeStore.setState({
    status: 1,
    elapsedTime: 0,
    lastBreak: 0,
    abortController,
    statusText: "Pondering",
  });
  resetStreamState();

  const agent = new Agent({
    model: useSettingsStore.getState().generalModel,
    systemPrompt: "",
    tools: {},
    temperature: 0.7,
  });

  try {
    const { response } = agent.stream(query, {
      abortSignal: abortController.signal,
      onStreamChunk: async (chunk) => {
        log(JSON.stringify(chunk, null, 2));
        const usage: TokenUsage = handleStreamChunk(
          chunk as Record<string, unknown>,
        );
        await incrementModelUsage(agent.getModel(), usage);
      },
    });

    const result = await response;
    log(JSON.stringify(result, null, 2));

    if (pendingChanges.hasChanges()) {
      useFraudeStore.setState({ status: 3, statusText: "Reviewing Changes" });
      updateOutput("confirmation", JSON.stringify({}));
    } else {
      updateOutput("done", "Task Completed");
    }
  } catch (error) {
    log(error);
    updateOutput(
      "error",
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Only reset status if not in reviewing mode
  if (useFraudeStore.getState().status !== 3) {
    useFraudeStore.setState({
      status: 0,
      abortController: null,
      statusText: "",
    });
  }
}
