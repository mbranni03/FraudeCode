import { tool } from "ai";
import { z } from "zod";
import { Agent } from "@/agent";
import readTool from "../tools/readTool";
import bashTool from "../tools/bashTool";
import grepTool from "../tools/grepTool";
import globTool from "../tools/globTool";

const contextSubAgentTool = tool({
  description:
    "Use this tool to gather context for the user's query. This tool has access to the file system and can read files, execute bash commands, and search for files using glob patterns.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Provide guidance on what to search for and any other relevant information to the user's query"
      ),
  }),
  execute: async ({ query }) => {
    const subagent = new Agent({
      model: "openai/gpt-oss-120b",
      systemPrompt: prompt,
      tools: { readTool, bashTool, grepTool, globTool },
      temperature: 0.7,
      maxSteps: 10,
    });
    const result = await subagent.chat(query);
    return result;
  },
});

export default contextSubAgentTool;

const prompt = `
You are an assistant that helps gather context for the user query. 
Use the tools provided to gather context required to achieve the user's request. 
Compile all context and ensure you reference all relevant filePaths.

DO NOT attempt to answer the user's query.
ONLY gather context and return it.
`;
