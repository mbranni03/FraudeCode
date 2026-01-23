import { tool } from "ai";
import { z } from "zod";
import { Agent } from "@/agent";
import readTool from "../tools/readTool";
import bashTool from "../tools/bashTool";
import grepTool from "../tools/grepTool";
import globTool from "../tools/globTool";
import useFraudeStore from "@/store/useFraudeStore";
import useSettingsStore from "@/store/useSettingsStore";
import lspTool from "../tools/lspTool";

const { updateOutput } = useFraudeStore.getState();

const researchSubAgentTool = tool({
  description: `Ask a specialized researcher to find information in the codebase.
    Use this BEFORE making edits to ensure you know the file structure and logic.`,
  inputSchema: z.object({
    question: z
      .string()
      .describe("The specific question about the code to answer."),
  }),
  execute: async ({ question }) => {
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Searching for context",
        details: question,
        result: "",
      }),
      { dontOverride: true },
    );
    // Create agent at execution time to pick up current settings
    // Use isolated context to prevent contaminating the parent agent's context
    const subagent = new Agent({
      model: useSettingsStore.getState().lightWeightModel,
      systemPrompt: prompt,
      tools: { readTool, bashTool, grepTool, globTool, lspTool },
      temperature: 0.7,
      maxSteps: 10,
      useIsolatedContext: true,
    });
    const result = await subagent.chat(question);
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Explored context",
        details: question,
        result: result.text,
      }),
    );
    return result.text;
  },
});

export default researchSubAgentTool;

const prompt = `
You are a read-only research assistant.
Your goal is to answer the user's question by exploring the file system.
- You cannot edit files.
- Be aggressive with your tools to find answers.
- Return a CONCISE summary of your findings (file paths, line numbers, and logic explanations).
- Do not output code unless asked, just explain where it is.
`;
