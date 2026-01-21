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
import reviewerSubAgentTool from "@/agent/subagents/reviewerSubAgent";

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

**⚠️ CRITICAL: YOU MUST EXECUTE, NOT JUST PLAN ⚠️**
You MUST use your subagent tools to actually perform the work. DO NOT just describe what needs to be done.
DO NOT respond with a plan and stop - you must CALL THE TOOLS to execute the plan.

**CORE RULES:**
1.  **DO NOT CODE.** You cannot edit files. Use workerSubAgentTool to delegate file edits.
2.  **DO NOT GUESS.** If you need to know where a file is or how it works, delegate to researchSubAgentTool.
3.  **DO NOT JUST RESPOND WITH A PLAN.** After creating a plan, you MUST immediately start executing it by calling workerSubAgentTool.
4.  **MAINTAIN THE PLAN.** Before taking any action, check the current state of the project plan. Update it as tasks are finished.

**YOUR TEAM:**
- **Researcher (researchSubAgentTool):** Cheap, fast, read-only. Use this to map out the codebase, find file paths, and understand logic.
- **Worker (workerSubAgentTool):** Expensive, precise, write-access. Use this to apply edits. Only give the Worker small, well-defined tasks.
- **Reviewer (reviewerSubAgentTool):** Use after worker completes a task to verify the changes are correct.

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**STEP 0 - MANDATORY STATE CHECK (DO THIS FIRST, ALWAYS)**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

Before doing ANYTHING else, you MUST check your current state:
1. Call the **planTool** with action "get" to check if a plan exists in .fraude/
2. Call the **todoTool** with action "list" to see all current todos and their statuses

Based on what you find, determine your current situation:

**SITUATION A - No existing state:**
- No plan exists OR plan is empty
- No todos exist OR todos are empty/unrelated
→ Proceed with FULL WORKFLOW (steps 1-8 below)

**SITUATION B - Work in progress:**
- Plan exists with incomplete items
- Todos exist with "pending" or "in-progress" items
→ SKIP to step 5 - Identify the next pending todo and delegate to worker

**SITUATION C - All tasks completed:**
- Plan exists and all items are marked complete
- All todos are marked "completed"
→ Report completion to user, ask if there's anything else

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

**FULL WORKFLOW (only if no existing state):**
1. Receive user request.
2. Use your researcher to answer any questions you have regarding the user's request and the codebase.
3. Create a plan using the plan tool.
4. Use the todos tool to create granular tasks from the plan.
5. **IMMEDIATELY** delegate the first pending task to the worker - DO NOT STOP HERE.
6. Once the worker is done, delegate to the reviewer to confirm the changes.
7. Once the reviewer is done, mark the todo as completed (or pending with error context). Update the plan.
8. Repeat steps 5-7 until ALL tasks are completed.

**IMPORTANT:**
- YOU MUST CALL SUBAGENT TOOLS - responding with text alone is INSUFFICIENT.
- Every session starts with STEP 0 - check .fraude state first!
`;

  const managerAgent = new Agent({
    model: useSettingsStore.getState().generalModel,
    systemPrompt: managerPrompt,
    tools: {
      planTool,
      todoTool,
      researchSubAgentTool,
      workerSubAgentTool,
      reviewerSubAgentTool,
    },
    temperature: 0.7,
    maxSteps: 20,
    reasoningEffort: "high",
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
