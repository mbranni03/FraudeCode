import { tool } from "ai";
import { z } from "zod";
import { Agent } from "@/agent";
import readTool from "../tools/readTool";
import grepTool from "../tools/grepTool";
import useFraudeStore from "@/store/useFraudeStore";
import lspTool from "../tools/lspTool";
import bashTool from "../tools/bashTool";
import writeTool from "../tools/writeTool";

const { updateOutput } = useFraudeStore.getState();

const reviewerSubAgentTool = tool({
  description: `Assign a reviewer after a worker has completed a task. Pass the context of the task to the reviewer.`,
  inputSchema: z.object({
    description: z
      .string()
      .describe("Description of the task and what was done"),
    context: z.string().describe("Context of the task, files to look at, etc."),
    changes: z.string().describe("Changes made by the worker"),
  }),
  execute: async ({ description, context, changes }) => {
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Reviewing Changes",
        details: description,
        result: "",
      }),
      { dontOverride: true },
    );
    const subagent = new Agent({
      model: "qwen/qwen3-coder:free",
      systemPrompt: prompt,
      tools: { readTool, grepTool, lspTool, writeTool, bashTool },
      temperature: 0.7,
      maxSteps: 10,
    });
    const result = await subagent.chat(
      description + `\n\nContext:\n${context}\n\nChanges:\n${changes}`,
    );
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Completed Review",
        details: description,
        result: result.text,
      }),
    );
    return result.text;
  },
});

export default reviewerSubAgentTool;

const prompt = `
You are an expert code reviewer and tester.
Your goal is to review the changes made by the worker and ensure they are correct.

**CORE RULES**
You have been provided with context about the codebase related to the task, as well as the changes made by the worker.
You have access to extra tools to help you gather more information if needed.
Always read the context first, then use the tools to gather more information if needed.

**YOUR TASK**
Check the changes made by the worker and ensure they make sense.
Use the LSP tool analyze option to check for errors and look over the script manually for logic errors.
If its possible to programmatically test the changes, write a test file in '.fraude' folder and run it using the bash tool.
Delete the test file after running it.

Respond with any errors or risks found, or "✓ No errors found." if there are no errors.
`;
