import { tool } from "ai";
import { z } from "zod";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import useFraudeStore from "@/store/useFraudeStore";
import {
  markTaskComplete,
  updateUserStory,
  addBlocker,
  getProgress,
} from "@/utils/ralphState";
import DESCRIPTION from "./descriptions/validateTask.txt";

const { updateOutput } = useFraudeStore.getState();

/**
 * Run a command and return whether it succeeded
 */
async function runCommand(
  command: string
): Promise<{ success: boolean; output: string }> {
  try {
    const proc = Bun.spawn(["sh", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    return { success: exitCode === 0, output: stdout.trim() };
  } catch {
    return { success: false, output: "Command failed to execute" };
  }
}

const validateTaskTool = tool({
  description: DESCRIPTION,
  inputSchema: z.object({
    taskId: z
      .string()
      .describe(
        "The ID of the task to validate (optional, uses current task if not provided)"
      )
      .optional(),
    checks: z
      .array(
        z.object({
          type: z
            .enum(["fileExists", "contentContains", "commandSucceeds"])
            .describe("Type of validation check"),
          path: z
            .string()
            .describe("File path (for fileExists and contentContains)")
            .optional(),
          pattern: z
            .string()
            .describe("Text pattern to search for (for contentContains)")
            .optional(),
          command: z
            .string()
            .describe("Command to run (for commandSucceeds)")
            .optional(),
          description: z
            .string()
            .describe(
              "Human-readable description of what this check validates"
            ),
        })
      )
      .describe("List of validation checks to perform"),
  }),
  execute: async ({ taskId, checks }) => {
    try {
      // Get task ID from current task if not provided
      const progress = await getProgress();
      const targetTaskId = taskId || progress.currentTask;

      if (!targetTaskId) {
        throw new Error("No task ID provided and no current task in progress");
      }

      const results: { check: string; passed: boolean; details: string }[] = [];
      let allPassed = true;

      for (const check of checks) {
        let passed = false;
        let details = "";

        switch (check.type) {
          case "fileExists":
            if (!check.path) {
              details = "No path provided";
            } else {
              passed = existsSync(check.path);
              details = passed ? "File exists" : "File not found";
            }
            break;

          case "contentContains":
            if (!check.path || !check.pattern) {
              details = "Path or pattern missing";
            } else if (!existsSync(check.path)) {
              details = "File not found";
            } else {
              const content = await readFile(check.path, "utf-8");
              passed = content.includes(check.pattern);
              details = passed ? "Pattern found" : "Pattern not found";
            }
            break;

          case "commandSucceeds":
            if (!check.command) {
              details = "No command provided";
            } else {
              const result = await runCommand(check.command);
              passed = result.success;
              details = passed
                ? "Command succeeded"
                : `Command failed: ${result.output}`;
            }
            break;
        }

        if (!passed) allPassed = false;

        results.push({
          check: check.description,
          passed,
          details,
        });
      }

      if (allPassed) {
        // Mark task as complete
        await markTaskComplete(targetTaskId);
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Task Validated",
            details: "All checks passed",
            result: `Task ${targetTaskId} marked complete`,
          })
        );
      } else {
        // Update task status and add blockers
        await updateUserStory(targetTaskId, { status: "blocked" });
        const failedChecks = results
          .filter((r) => !r.passed)
          .map((r) => r.check);
        for (const blocker of failedChecks) {
          await addBlocker(blocker);
        }
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Task Validation Failed",
            details: `${failedChecks.length} checks failed`,
            result: failedChecks.join(", "),
          })
        );
      }

      return {
        taskId: targetTaskId,
        allChecksPassed: allPassed,
        results,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Validation failed: ${message}`);
    }
  },
});

export default validateTaskTool;
