import { tool } from "ai";
import { z } from "zod";
import useFraudeStore from "@/store/useFraudeStore";
import { projectPath } from "@/utils";

import DESCRIPTION from "./descriptions/edit.txt";
const { updateOutput } = useFraudeStore.getState();

const editTool = tool({
  description: DESCRIPTION,
  inputSchema: z.object({
    path: z.string().describe("The path to the file to edit"),
    old_content: z
      .string()
      .describe(
        "Must be unique and match the file exactly (whitespace matters)"
      ),
    new_content: z.string().describe("The new content of the file"),
  }),
  execute: async ({ path, old_content, new_content }) => {
    const fileContent = await Bun.file(path).text();
    if (!fileContent.includes(old_content)) {
      throw new Error("Old content does not match file");
    }
    const newFileContent = fileContent.replace(old_content, new_content);
    await Bun.write(path, newFileContent);
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Edited File",
        details: projectPath(path),
        result: new_content,
      }),
      { dontOverride: true }
    );
    return { success: true };
  },
});

export default editTool;
