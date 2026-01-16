import { tool } from "ai";
import { z } from "zod";
import useFraudeStore from "@/store/useFraudeStore";
import {
  getProgress,
  getRequirements,
  getNextTask,
  setCurrentTask,
  updateUserStory,
  incrementIteration,
  isProjectComplete,
  getPlan,
} from "@/utils/ralphState";
import DESCRIPTION from "./descriptions/subagentTask.txt";

const { updateOutput } = useFraudeStore.getState();

/**
 * Build minimal context for the current iteration
 * This includes only what the agent needs for the current task
 */
async function buildIterationContext(taskId: string) {
  const requirements = await getRequirements();
  const task = requirements.userStories.find((t) => t.id === taskId);
  const plan = await getPlan();

  return {
    projectName: requirements.projectName,
    projectGoal: requirements.goal,
    currentTask: task,
    planSummary: plan.slice(0, 1000), // Truncate plan to save context
    totalTasks: requirements.userStories.length,
    completedCount: requirements.userStories.filter(
      (t) => t.status === "completed"
    ).length,
  };
}

const subagentTaskTool = tool({
  description: DESCRIPTION,
  inputSchema: z.object({
    action: z
      .enum(["start", "complete", "status"])
      .describe(
        "Action: 'start' picks next task, 'complete' marks current done, 'status' shows progress"
      )
      .default("start"),
    notes: z
      .string()
      .describe("Optional notes about the task execution")
      .optional(),
  }),
  execute: async ({ action, notes }) => {
    try {
      const progress = await getProgress();

      switch (action) {
        case "status": {
          // Return current progress status
          const requirements = await getRequirements();
          const completed = requirements.userStories.filter(
            (t) => t.status === "completed"
          ).length;
          const pending = requirements.userStories.filter(
            (t) => t.status === "pending"
          ).length;
          const inProgress = requirements.userStories.filter(
            (t) => t.status === "in-progress"
          ).length;

          updateOutput(
            "toolCall",
            JSON.stringify({
              action: "Ralph Status",
              details: `Iteration ${progress.iteration}`,
              result: `${completed}/${requirements.userStories.length} complete`,
            })
          );

          return {
            iteration: progress.iteration,
            currentTask: progress.currentTask,
            stats: { completed, pending, inProgress },
            isComplete: await isProjectComplete(),
          };
        }

        case "start": {
          // Check if project is already complete
          if (await isProjectComplete()) {
            return {
              complete: true,
              message: "All tasks completed! Project is done.",
              context: null,
            };
          }

          // Increment iteration counter
          const iteration = await incrementIteration();

          // Get next task
          const task = await getNextTask();
          if (!task) {
            return {
              complete: true,
              message: "No more pending tasks",
              context: null,
            };
          }

          // Mark as in-progress
          await updateUserStory(task.id, { status: "in-progress" });
          await setCurrentTask(task.id);

          // Build minimal context
          const context = await buildIterationContext(task.id);

          updateOutput(
            "toolCall",
            JSON.stringify({
              action: "Ralph Iteration Started",
              details: `#${iteration}: ${task.title}`,
              result: task.description,
            })
          );

          return {
            complete: false,
            iteration,
            message: `Starting iteration ${iteration}`,
            context,
            instructions: `
Execute the following task:
- Title: ${task.title}
- Description: ${task.description}
- Acceptance Criteria:
${task.acceptanceCriteria.map((c) => `  - ${c}`).join("\n")}

After completing the task, call subagentTask with action="complete".
            `.trim(),
          };
        }

        case "complete": {
          // Mark current task as complete
          const taskId = progress.currentTask;
          if (!taskId) {
            return {
              success: false,
              message: "No task currently in progress",
            };
          }

          await updateUserStory(taskId, { status: "completed" });
          await setCurrentTask(null);

          const requirements = await getRequirements();
          const task = requirements.userStories.find((t) => t.id === taskId);

          updateOutput(
            "toolCall",
            JSON.stringify({
              action: "Task Completed",
              details: task?.title || taskId,
              result: notes || "No notes",
            })
          );

          // Check if this was the last task
          const isComplete = await isProjectComplete();

          return {
            success: true,
            taskId,
            taskTitle: task?.title,
            notes,
            projectComplete: isComplete,
            message: isComplete
              ? "🎉 All tasks completed! Project is done."
              : "Task completed. Call subagentTask with action='start' for next iteration.",
          };
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Ralph iteration failed: ${message}`);
    }
  },
});

export default subagentTaskTool;
