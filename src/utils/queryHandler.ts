import useFraudeStore from "@/store/useFraudeStore";
import CommandCenter from "@/features/commands";

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
  await new Promise((resolve) => setTimeout(resolve, 1000));
  useFraudeStore.setState({ status: 0, elapsedTime: 0 });
}
