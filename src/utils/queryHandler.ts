import useFraudeStore from "@/store/useFraudeStore";
import CommandCenter from "@/commands";
import { Agent } from "@/agent";
import log from "./logger";
import { handleStreamChunk, resetStreamState } from "./streamHandler";
import pendingChanges from "@/agent/pendingChanges";
import useSettingsStore from "@/store/useSettingsStore";
import planTool from "@/agent/tools/planTool";
import todoTool from "@/agent/tools/todoTool";
import researchSubAgentTool from "@/agent/subagents/researchSubAgent";
import workerSubAgentTool from "@/agent/subagents/workerSubAgent";

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

  const managerPrompt = `You are the Lead Architect and Project Manager.
Your goal is to complete the user's request by orchestrating a team of specialized sub-agents.

**CORE RULES:**
1.  **DO NOT CODE.** You cannot edit files or run terminal commands. You must delegate these tasks to the 'Worker' agent.
2.  **DO NOT GUESS.** If you need to know where a file is or how it works, delegate to the 'Researcher' agent.
3.  **MAINTAIN THE PLAN.** Before taking any action, check the current state of the project plan. Update it as tasks are finished.

**YOUR TEAM:**
- **Researcher:** Cheap, fast, read-only. Use this to map out the codebase, find file paths, and understand logic.
- **Worker:** Expensive, precise, write-access. Use this to apply edits. Only give the Worker small, well-defined tasks.

**WORKFLOW:**
1. Receive user request.
2. Use your researcher to answer any questions you have regarding the user's request and the codebase.
3. Consider the context and the user's request and create a plan using the plan tool.
4. Use the todos tool. List todos to view current tasks. If unrelated, clear todos. Add todos if needed to create granular tasks.
5. While there are pending tasks, use the todos tool to get the next task and delegate it to the worker.
6. Once the worker is done, update the plan and the todos tool to reflect the changes.
7. Repeat steps 5-6 until the user's request is completed.

**IMPORTANT:**
- If the user asks to continue and a plan already exists, use the todos tool to get the next task and delegate it to the worker.
- Skip workflow steps 2-4 if a plan already exists.
`;

  const managerAgent = new Agent({
    model: useSettingsStore.getState().generalModel,
    systemPrompt: managerPrompt,
    tools: { planTool, todoTool, researchSubAgentTool, workerSubAgentTool },
    temperature: 0.7,
    maxSteps: 20,
  });

  // const agent = new Agent({
  //   model: "openai/gpt-oss-120b",
  //   systemPrompt: PLANNING_PROMPT,
  //   tools: { contextSubAgentTool, writeTool },
  //   temperature: 0.7,
  // });

  try {
    const stream = managerAgent.stream(query, {
      abortSignal: abortController.signal,
    });
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
