import { tool } from "ai";
import { z } from "zod";
import useFraudeStore from "@/store/useFraudeStore";
import {
  setRequirements,
  setPlan,
  getRequirements,
  type RalphTask,
  type RalphRequirements,
} from "@/utils/ralphState";
import DESCRIPTION from "./descriptions/plan.txt";

const { updateOutput } = useFraudeStore.getState();

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Format tasks into markdown implementation plan
 */
function formatPlanMarkdown(requirements: RalphRequirements): string {
  let md = `# Implementation Plan: ${requirements.projectName}\n\n`;
  md += `## Goal\n${requirements.goal}\n\n`;
  md += `## Tasks\n\n`;

  requirements.userStories.forEach((task, index) => {
    const statusIcon =
      task.status === "completed"
        ? "✅"
        : task.status === "in-progress"
        ? "🔄"
        : task.status === "blocked"
        ? "⛔"
        : "⬜";

    md += `### ${index + 1}. ${statusIcon} ${task.title}\n\n`;
    md += `**Priority:** ${task.priority}\n`;
    md += `**Status:** ${task.status}\n\n`;
    md += `${task.description}\n\n`;
    md += `**Acceptance Criteria:**\n`;
    task.acceptanceCriteria.forEach((criterion) => {
      md += `- [ ] ${criterion}\n`;
    });
    md += `\n---\n\n`;
  });

  return md;
}

const planTool = tool({
  description: DESCRIPTION,
  inputSchema: z.object({
    goal: z
      .string()
      .describe("The high-level objective or requirement description"),
    projectName: z
      .string()
      .describe("Name of the project or feature")
      .optional(),
    context: z
      .string()
      .describe("Optional additional context about the project")
      .optional(),
    tasks: z
      .array(
        z.object({
          title: z.string().describe("Short, descriptive task title"),
          description: z.string().describe("Detailed task description"),
          acceptanceCriteria: z
            .array(z.string())
            .describe("List of criteria to verify task completion"),
          priority: z
            .number()
            .describe("Priority order (1 = highest)")
            .default(10),
        })
      )
      .describe("List of tasks to add to the implementation plan"),
  }),
  execute: async ({ goal, projectName, context, tasks }) => {
    try {
      // Get existing requirements or create new
      const existing = await getRequirements();

      // Build new requirements
      const requirements: RalphRequirements = {
        projectName: projectName || existing.projectName || "Unnamed Project",
        goal: goal || existing.goal,
        userStories: [
          ...existing.userStories,
          ...tasks.map(
            (task): RalphTask => ({
              id: generateTaskId(),
              title: task.title,
              description: task.description,
              acceptanceCriteria: task.acceptanceCriteria,
              status: "pending",
              priority: task.priority,
            })
          ),
        ].sort((a, b) => a.priority - b.priority),
      };

      // Save requirements
      await setRequirements(requirements);

      // Generate and save markdown plan
      const planMarkdown = formatPlanMarkdown(requirements);
      await setPlan(planMarkdown);

      updateOutput(
        "toolCall",
        JSON.stringify({
          action: "Generated Implementation Plan",
          details: `${tasks.length} tasks added`,
          result: planMarkdown.slice(0, 500) + "...",
        })
      );

      return {
        success: true,
        taskCount: requirements.userStories.length,
        newTasksAdded: tasks.length,
        planPath: ".fraude/IMPLEMENTATION_PLAN.md",
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to generate plan: ${message}`);
    }
  },
});

export default planTool;
