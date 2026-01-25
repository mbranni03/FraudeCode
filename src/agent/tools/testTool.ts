import { tool } from "ai";
import { z } from "zod";
import useFraudeStore from "@/store/useFraudeStore";
import pendingChanges from "@/agent/pendingChanges";

const { updateOutput } = useFraudeStore.getState();

const testTool = tool({
  description: `Create OR UPDATE a TEMPORARY test file to verify changes. 
  This file will NOT be saved to the project permanently and will NOT appear in the user's pending changes list.
  Use this tool specifically when you want to create a reproduction script or a new test case to verify your changes without cluttering the project.
  If you need to fix a mistake in the test file, simply call this tool again with the same path and the corrected content.`,
  strict: true,
  inputSchema: z.object({
    path: z
      .string()
      .describe(
        "The path to the temporary test file (e.g., 'tests/temp_repro.test.ts')",
      ),
    content: z.string().describe("The content of the test file"),
  }),
  execute: async ({ path, content }) => {
    // Add change with hidden: true
    const change = await pendingChanges.addChange(path, content, "write", {
      hidden: true,
    });

    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Created Temporary Test",
        details: path,
        result: "(Hidden from pending changes)",
      }),
      { dontOverride: true },
    );
    return {
      success: true,
      message: `Created temporary test at ${path}. You can now run it using testRunnerTool.`,
    };
  },
});

export default testTool;
