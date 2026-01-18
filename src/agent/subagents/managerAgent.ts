import { tool } from "ai";
import { z } from "zod";
import { Agent } from "@/agent";
import planTool from "../tools/planTool";
import todoTool from "../tools/todoTool";
import researchSubAgentTool from "./researchSubAgent";
import useFraudeStore from "@/store/useFraudeStore";
import useSettingsStore from "@/store/useSettingsStore";

const { updateOutput } = useFraudeStore.getState();

const MANAGER_PROMPT = `You are a Planning Manager. Create implementation plans and assign tasks to workers.

## WORKFLOW

1. **Read existing state**
   - planTool(read) - check for existing plan
   - todoTool(list) - check for pending tasks

2. **Research if needed**
   - Use researchSubAgentTool to find file paths and understand code
   - Only research what you don't know

3. **Write the plan**
   - planTool(write) with a simple numbered list
   - This is the high-level roadmap (workers won't see this)

4. **Create tasks with context**
   - todoTool(add) for each step
   - ALWAYS include context.files (paths the worker needs)
   - ALWAYS include context.instructions (specific steps)

## RULES

- You CANNOT edit code. Only plan and delegate.
- Workers get ONLY the task + context, not the full plan
- Be specific: include exact file paths and what to change
- One task = one focused change

## EXAMPLE TASK

todoTool({
  operation: "add",
  description: "Add greeting function to utils",
  context: {
    files: ["src/utils/helpers.ts"],
    instructions: "Add a function called greet(name: string) that returns 'Hello, {name}!'"
  }
})
`;

const managerAgentTool = tool({
  description: `Invoke the Planning Manager to analyze a request and create an implementation plan.
The manager will research the codebase, create a plan, and set up tasks with context for workers.`,

  inputSchema: z.object({
    request: z.string().describe("The user's request or task to plan for"),
  }),

  execute: async ({ request }) => {
    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Planning",
        details: request.slice(0, 50) + (request.length > 50 ? "..." : ""),
        result: "",
      }),
      { dontOverride: true },
    );

    const manager = new Agent({
      model: useSettingsStore.getState().generalModel,
      systemPrompt: MANAGER_PROMPT,
      tools: { planTool, todoTool, researchSubAgentTool },
      temperature: 0.7,
      maxSteps: 15,
    });

    const result = await manager.chat(request);

    updateOutput(
      "toolCall",
      JSON.stringify({
        action: "Plan Created",
        details: "Tasks ready for workers",
        result: "✓",
      }),
    );

    return result.text;
  },
});

export default managerAgentTool;
export { MANAGER_PROMPT };
