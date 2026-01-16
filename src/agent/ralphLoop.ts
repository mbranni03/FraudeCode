import { createAgent } from "./agent";
import {
  initRalphState,
  cleanupRalphState,
  getProgress,
  getRequirements,
  isProjectComplete,
  getNextTask,
  incrementIteration,
  setCurrentTask,
  updateUserStory,
  markTaskComplete,
  type RalphTask,
} from "@/utils/ralphState";

// Import tools
import bashTool from "./tools/bashTool";
import readTool from "./tools/readTool";
import writeTool from "./tools/writeTool";
import editTool from "./tools/editTool";
import grepTool from "./tools/grepTool";
import globTool from "./tools/globTool";
import validateTaskTool from "./tools/validateTaskTool";

// ============================================================================
// Ralph Loop Configuration
// ============================================================================

export interface RalphConfig {
  maxIterations: number;
  model?: string;
  systemPrompt?: string;
  onIterationStart?: (iteration: number, task: RalphTask) => void;
  onIterationComplete?: (iteration: number, success: boolean) => void;
  onProjectComplete?: () => void;
}

const DEFAULT_CONFIG: RalphConfig = {
  maxIterations: 100,
};

// ============================================================================
// Ralph System Prompt
// ============================================================================

const RALPH_SYSTEM_PROMPT = `You are an AI agent operating in "Ralph Mode" - an iterative execution workflow.

CORE PRINCIPLES:
1. Focus ONLY on the current task - don't try to do everything at once
2. Use tools to accomplish the task's acceptance criteria
3. Validate your work before marking complete
4. Keep changes small and atomic

WORKFLOW:
1. You will receive a single task with acceptance criteria
2. Execute the task using available tools
3. Validate the acceptance criteria are met
4. Report completion

Be precise, be focused, and complete one task at a time.`;

// ============================================================================
// Single Iteration Runner
// ============================================================================

async function runIteration(
  task: RalphTask,
  config: RalphConfig
): Promise<{ success: boolean; error?: string }> {
  const agent = createAgent({
    model: config.model || "gemini-2.0-flash-lite",
    systemPrompt: config.systemPrompt || RALPH_SYSTEM_PROMPT,
    tools: {
      bashTool,
      readTool,
      writeTool,
      editTool,
      grepTool,
      globTool,
      validateTaskTool,
    },
    maxSteps: 20,
  });

  const taskPrompt = `
## Current Task

**Title:** ${task.title}
**ID:** ${task.id}
**Priority:** ${task.priority}

### Description
${task.description}

### Acceptance Criteria
${task.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

---

Complete this task by:
1. Understanding what needs to be done
2. Using tools to implement the solution
3. Validating that acceptance criteria are met

When finished, use the validateTask tool to verify completion.
`.trim();

  try {
    const response = await agent.chat(taskPrompt);

    // Check if task was validated
    const validated = response.steps?.some((step) =>
      step.toolResults?.some(
        (r: { toolName: string }) => r.toolName === "validateTask"
      )
    );

    return { success: validated || false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// Main Ralph Loop
// ============================================================================

export async function runRalphLoop(
  config: Partial<RalphConfig> = {}
): Promise<{ completed: boolean; iterations: number; error?: string }> {
  const cfg: RalphConfig = { ...DEFAULT_CONFIG, ...config };

  // Initialize state
  await initRalphState();

  let iterations = 0;

  try {
    while (iterations < cfg.maxIterations) {
      // Check if project is complete
      if (await isProjectComplete()) {
        cfg.onProjectComplete?.();
        await cleanupRalphState();
        return { completed: true, iterations };
      }

      // Get next task
      const task = await getNextTask();
      if (!task) {
        await cleanupRalphState();
        return { completed: true, iterations };
      }

      // Increment iteration
      iterations = await incrementIteration();

      // Mark task as in-progress
      await updateUserStory(task.id, { status: "in-progress" });
      await setCurrentTask(task.id);

      cfg.onIterationStart?.(iterations, task);

      // Run iteration with fresh agent context
      const result = await runIteration(task, cfg);

      if (result.success) {
        await markTaskComplete(task.id);
        cfg.onIterationComplete?.(iterations, true);
      } else {
        // Mark as blocked, will retry next iteration
        await updateUserStory(task.id, { status: "blocked" });
        cfg.onIterationComplete?.(iterations, false);

        // If error, return early (don't cleanup - allow resume)
        if (result.error) {
          return { completed: false, iterations, error: result.error };
        }
      }

      // Clear current task
      await setCurrentTask(null);
    }

    return {
      completed: false,
      iterations,
      error: `Max iterations (${cfg.maxIterations}) reached`,
    };
  } catch (err) {
    // On unexpected error, don't cleanup to allow debugging
    const message = err instanceof Error ? err.message : String(err);
    return { completed: false, iterations, error: message };
  }
}

// ============================================================================
// Export for CLI/UI integration
// ============================================================================

export { initRalphState, getProgress, getRequirements, isProjectComplete };
