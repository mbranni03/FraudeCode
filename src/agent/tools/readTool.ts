import { tool } from "ai";
import { z } from "zod";
import path from "path";
import { projectPath } from "@/utils";
import useFraudeStore from "@/store/useFraudeStore";
import DESCRIPTION from "./descriptions/read.txt";

const { updateOutput } = useFraudeStore.getState();

const readTool = tool({
  description: DESCRIPTION,
  inputSchema: z.object({
    filePath: z.string().describe("The path to the file to read"),
    offset: z.coerce
      .number()
      .describe("The line number to start reading from (0-based)")
      .optional(),
    limit: z.coerce
      .number()
      .describe("The number of lines to read (defaults to 500)")
      .optional(),
  }),
  execute: async ({
    filePath,
    offset = 0,
    limit = 500,
  }: {
    filePath: string;
    offset?: number;
    limit?: number;
  }) => {
    if (!path.isAbsolute(filePath)) {
      filePath = path.join(process.cwd(), filePath);
    }
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      updateOutput(
        "toolCall",
        JSON.stringify({
          action: "Error Reading" + projectPath(filePath),
          details: "File doesn't exist",
          result: "",
        })
      );
      throw new Error("File doesn't exist");
    }
    const text = await file.text();
    const lines = text.split("\n");
    const lastLine = Math.min(offset + limit, lines.length);
    const result = lines.slice(offset, lastLine).join("\n");
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Analyzing " + projectPath(filePath),
        details: "#L" + (offset + 1) + "-" + lastLine,
        result: result,
      })
    );
    if (text.trim() === "") {
      throw new Error("File is empty");
    }
    return {
      result,
      lastLine,
    };
  },
});

export default readTool;
