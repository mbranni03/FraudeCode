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
  useFraudeStore.setState({ status: 1, elapsedTime: 0, lastBreak: 0 });
  resetStreamState();

  const agent = new Agent({
    model: "openai/gpt-oss-120b",
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

  const stream = agent.stream(query);
  for await (const chunk of stream.stream) {
    log(JSON.stringify(chunk, null, 2));
    handleStreamChunk(chunk as Record<string, unknown>);
  }
  useFraudeStore.setState({ status: 0 });
}
