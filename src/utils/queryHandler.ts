import useFraudeStore from "@/store/useFraudeStore";
import CommandCenter from "@/commands";
import { llm } from "./llm";
import { createAgent } from "langchain";

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
  const model = llm.general();
  const agent = createAgent({
    model,
  });
  const response = await agent.invoke({
    messages: [
      {
        role: "user",
        content: query,
      },
    ],
  });
  useFraudeStore.setState({ status: 0, elapsedTime: 0 });
}
