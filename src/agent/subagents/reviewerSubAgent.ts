import { Agent } from "@/agent";
import readTool from "../tools/readTool";
import grepTool from "../tools/grepTool";
import lspTool from "../tools/lspTool";
import bashTool from "../tools/bashTool";
import writeTool from "../tools/writeTool";
import useSettingsStore from "@/store/useSettingsStore";
import todoTool from "../tools/todoTool";
import ReviewerPrompt from "../prompts/ReviewerPrompt.txt";

let _reviewerSubAgent: Agent | null = null;

/**
 * Get the reviewer subagent instance.
 * Uses lazy initialization to ensure settings are loaded before reading generalModel.
 */
export function getReviewerSubAgent(): Agent {
  if (!_reviewerSubAgent) {
    _reviewerSubAgent = new Agent({
      model: useSettingsStore.getState().generalModel,
      systemPrompt: ReviewerPrompt,
      tools: { readTool, grepTool, lspTool, writeTool, bashTool, todoTool },
      temperature: 0.7,
      maxSteps: 10,
      useIsolatedContext: true,
    });
  }
  return _reviewerSubAgent;
}

export default getReviewerSubAgent;
