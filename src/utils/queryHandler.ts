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
1.  **DO NOT CODE.** You cannot edit files or run terminal commands. You must delegate these tasks to the 'Coder' agent.
2.  **DO NOT GUESS.** If you need to know where a file is or how it works, delegate to the 'Researcher' agent.
3.  **MAINTAIN THE PLAN.** Before taking any action, check the current state of the project plan. Update it as tasks are finished.

**YOUR TEAM:**
- **Researcher:** Cheap, fast, read-only. Use this to map out the codebase, find file paths, and understand logic.
- **Coder:** Expensive, precise, write-access. Use this to apply edits, run tests, and verify fixes. Only give the Coder small, well-defined tasks.

**WORKFLOW:**
1.  Receive user request.
2.  (Optional) Ask Researcher to gather context if you don't know the file structure.
3.  Update the Plan (break request into steps).
4.  Delegate the first step to the Coder.
5.  Review Coder's output. If successful, move to next step.`;

  const managerAgent = new Agent({
    model: useSettingsStore.getState().generalModel,
    systemPrompt: managerPrompt,
    tools: { planTool, todoTool, researchSubAgentTool },
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
