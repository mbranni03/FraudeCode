import { tool } from "ai";
import { z } from "zod";
import { Agent } from "@/agent";
import readTool from "../tools/readTool";
import grepTool from "../tools/grepTool";
import useFraudeStore from "@/store/useFraudeStore";
import writeTool from "../tools/writeTool";
import editTool from "../tools/editTool";

const { updateOutput } = useFraudeStore.getState();

const workerSubAgentTool = tool({
  description: `Assign a worker to complete a single task. Use get-next with taskTool first to get the task description and context. Then use this tool to complete the task.`,
  inputSchema: z.object({
    description: z
      .string()
      .describe("Description of the task and what needs to be done"),
    context: z.string().describe("Context of the task, files to look at, etc."),
  }),
  execute: async ({ description, context }) => {
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Working on task",
        details: description,
        result: "",
      }),
      { dontOverride: true },
    );
    const subagent = new Agent({
      model: "xiaomi/mimo-v2-flash:free",
      systemPrompt: prompt,
      tools: { readTool, grepTool, writeTool, editTool },
      temperature: 0.7,
      maxSteps: 10,
    });
    const result = await subagent.chat(
      description + `\n\nContext:\n${context}`,
    );
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Completed task",
        details: description,
        result: result.text,
      }),
    );
    return result.text;
  },
});

export default workerSubAgentTool;

const prompt = `
You are an expert software engineer.
Your goal is to complete the task assigned to you by modifying the codebase.

**CORE RULES**
You have been provided with context about the codebase, use it to complete the task.
You have access to extra tools to help you gather more information if needed.
Always read the context first, then use the tools to gather more information if needed.
Always read the files before you write or edit them.
`;
