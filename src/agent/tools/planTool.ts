import { tool } from "ai";
import { z } from "zod";
import path from "path";
import useFraudeStore from "@/store/useFraudeStore";

const { updateOutput } = useFraudeStore.getState();

// Path configuration
const FRAUDE_DIR = path.join(process.cwd(), ".fraude");
const PLAN_FILE = path.join(FRAUDE_DIR, "plan.md");

// Ensure .fraude directory exists
async function ensureDir(): Promise<void> {
  const dir = Bun.file(FRAUDE_DIR);
  if (!(await Bun.file(PLAN_FILE).exists())) {
    await Bun.write(PLAN_FILE, "# Implementation Plan\n\n*No plan yet.*\n");
  }
}

// Read the current plan
async function readPlan(): Promise<string> {
  await ensureDir();
  const file = Bun.file(PLAN_FILE);
  return await file.text();
}

// Write/overwrite the plan
async function writePlan(content: string): Promise<void> {
  await ensureDir();
  await Bun.write(PLAN_FILE, content);
}

const planTool = tool({
  description: `Manage the implementation plan stored in .fraude/plan.md.
ALWAYS read the plan at the start of a turn to see what to do.
Update the plan when tasks are assigned or completed.

Operations:
- read: Get the current plan
- write: Replace the entire plan with new content
- append: Add content to the end of the plan
- clear: Reset the plan to empty`,
  strict: true,
  inputSchema: z.object({
    operation: z
      .enum(["read", "write", "append", "clear"])
      .describe("The operation to perform on the plan"),
    content: z
      .string()
      .optional()
      .describe("Content to write or append (required for write/append)"),
  }),

  execute: async ({ operation, content }) => {
    switch (operation) {
      case "read": {
        const plan = await readPlan();
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Read Plan",
            details: `${plan.split("\n").length} lines`,
            result: "✓",
          }),
          { dontOverride: true },
        );
        return plan;
      }

      case "write": {
        if (!content) throw new Error("Content required for write operation");
        await writePlan(content);
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Wrote Plan",
            details: `${content.split("\n").length} lines`,
            result: "✓",
          }),
          { dontOverride: true },
        );
        return "Plan updated successfully.";
      }

      case "append": {
        if (!content) throw new Error("Content required for append operation");
        const existing = await readPlan();
        await writePlan(existing + "\n" + content);
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Appended to Plan",
            details: `+${content.split("\n").length} lines`,
            result: "✓",
          }),
          { dontOverride: true },
        );
        return "Content appended to plan.";
      }

      case "clear": {
        await writePlan("# Implementation Plan\n\n*No plan yet.*\n");
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Cleared Plan",
            details: "Reset to empty",
            result: "✓",
          }),
          { dontOverride: true },
        );
        return "Plan cleared.";
      }
    }
  },
});

export default planTool;
