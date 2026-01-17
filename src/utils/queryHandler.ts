import useFraudeStore from "@/store/useFraudeStore";
import CommandCenter from "@/commands";
import { Agent } from "@/agent";
import readTool from "@/agent/tools/readTool";
import bashTool from "@/agent/tools/bashTool";
import writeTool from "@/agent/tools/writeTool";
import log from "./logger";
import { handleStreamChunk, resetStreamState } from "./streamHandler";
import editTool from "@/agent/tools/editTool";
import grepTool from "@/agent/tools/grepTool";
import globTool from "@/agent/tools/globTool";
import contextSubAgentTool from "@/agent/subagents/contextSubAgent";
import PLANNING_PROMPT from "@/agent/planning.txt";
import pendingChanges from "@/agent/pendingChanges";
import useSettingsStore from "@/store/useSettingsStore";

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
    systemPrompt: "You are a helpful assistant.",
    tools: { readTool, bashTool, writeTool, editTool, grepTool, globTool },
    temperature: 0.7,
  });

  // const agent = new Agent({
  //   model: "openai/gpt-oss-120b",
  //   systemPrompt: PLANNING_PROMPT,
  //   tools: { contextSubAgentTool, writeTool },
  //   temperature: 0.7,
  // });

  try {
    const stream = agent.stream(query, { abortSignal: abortController.signal });
    for await (const chunk of stream.stream) {
      // Check if aborted between chunks
      if (abortController.signal.aborted) {
        log("Stream aborted by user");
        break;
      }
      log(JSON.stringify(chunk, null, 2));
      handleStreamChunk(chunk as Record<string, unknown>);
    }

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
  } finally {
    // Only reset status if not in reviewing mode
    if (useFraudeStore.getState().status !== 3) {
      useFraudeStore.setState({
        status: 0,
        abortController: null,
        statusText: "",
      });
    }
  }
}
