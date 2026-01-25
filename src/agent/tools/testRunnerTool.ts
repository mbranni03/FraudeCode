import { tool } from "ai";
import { z } from "zod";
import pendingChanges from "@/agent/pendingChanges";
import useFraudeStore from "@/store/useFraudeStore";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const { updateOutput } = useFraudeStore.getState();

const testRunnerTool = tool({
  description: `Run a shell command to verify the codebase state, INCLUDING pending changes.
  Crucial for testing changes before they are permanently applied.
  
  HOW IT WORKS:
  1. Temporarily applies ALL pending changes to disk.
  2. Runs your command (e.g., 'bun test').
  3. IMMEDIATELY restores the file system to its previous state.
  
  Use this to verify your changes actually work.`,
  strict: true,
  inputSchema: z.object({
    command: z
      .string()
      .describe(
        "The shell command to run (e.g., 'bun test tests/my.test.ts', 'python3 tests/test_app.py')",
      ),
  }),
  execute: async ({ command }) => {
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Running Test on Pending State",
        details: command,
        result: "...",
      }),
      { dontOverride: true },
    );

    try {
      // 1. Apply Changes
      await pendingChanges.applyAllTemporary();

      // 2. Run Command
      try {
        const { stdout, stderr } = await execAsync(command);
        const result = `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;

        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Test Result",
            details: command,
            result: stdout.slice(0, 100) + (stdout.length > 100 ? "..." : ""),
          }),
        );
        return result;
      } catch (error: any) {
        const result = `Command Failed:\n${error.message}\n\nSTDOUT:\n${error.stdout}\n\nSTDERR:\n${error.stderr}`;
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Test Failed",
            details: command,
            result: "Exit Code: " + error.code,
          }),
        );
        return result;
      }
    } finally {
      // 3. Restore State
      await pendingChanges.restoreAll();
    }
  },
});

export default testRunnerTool;
