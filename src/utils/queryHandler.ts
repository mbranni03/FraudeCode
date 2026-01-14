import useFraudeStore from "@/store/useFraudeStore";
import CommandCenter from "@/commands";
import { Agent } from "@/agent";

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
  useFraudeStore.setState({ status: 1 });
  // await new Promise((resolve) => setTimeout(resolve, 1000));
  const agent = new Agent({
    model: "openai/gpt-oss-120b",
    systemPrompt: "You are a helpful assistant.",
    temperature: 0.7,
  });

  const stream = agent.stream(query);
  let response = "";
  for await (const chunk of stream.textStream) {
    response += chunk;
    updateOutput("markdown", response);
  }
  useFraudeStore.setState({ status: 0, elapsedTime: 0 });
}
