import { tool } from "ai";
import { z } from "zod";
import useFraudeStore from "@/store/useFraudeStore";
import { projectPath } from "@/utils";

import DESCRIPTION from "./descriptions/write.txt";
const { updateOutput } = useFraudeStore.getState();

const writeTool = tool({
  description: DESCRIPTION,
  inputSchema: z.object({
    path: z.string().describe("The path to the file to write"),
    content: z.string().describe("The content to write to the file"),
  }),
  execute: async ({ path, content }) => {
    await Bun.write(path, content);
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Created New File",
        details: projectPath(path),
        result: content,
      }),
      { dontOverride: true }
    );
    return { success: true };
  },
});

export default writeTool;
