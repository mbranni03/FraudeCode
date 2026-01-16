import useFraudeStore from "@/store/useFraudeStore";
import CommandCenter from "@/commands";
import { Agent } from "@/agent";
import readTool from "@/agent/tools/readTool";
import bashTool from "@/agent/tools/bashTool";
import writeTool from "@/agent/tools/writeTool";
import editTool from "@/agent/tools/editTool";
import planTool from "@/agent/tools/planTool";
import grepTool from "@/agent/tools/grepTool";
import globTool from "@/agent/tools/globTool";
import log from "./logger";
import { handleStreamChunk, resetStreamState } from "./streamHandler";
import { runRalphLoop } from "@/agent/ralphLoop";

const { updateOutput } = useFraudeStore.getState();

// ============================================================================
// Ralph Mode Handler
// ============================================================================

async function handleRalphMode(goal: string) {
  updateOutput("agentText", `🚀 Starting Ralph mode for: ${goal}\n`);

  // Step 1: Planning - Use agent to create implementation plan
  updateOutput("agentText", "📋 Phase 1: Creating implementation plan...\n");

  const planAgent = new Agent({
    model: "openai/gpt-oss-120b",
    systemPrompt: `You are a planning assistant. Break down the user's goal into atomic, testable tasks.
Use the planTool to create an implementation plan with:
- Clear, specific task titles
- Detailed descriptions
- Measurable acceptance criteria
- Priority ordering (dependencies first)

Be thorough but keep tasks atomic - each should be completable in one iteration.`,
    tools: { planTool, readTool, writeTool, grepTool, globTool },
    temperature: 0.7,
  });

  const planStream = planAgent.stream(
    `Create an implementation plan for: ${goal}`
  );
  for await (const chunk of planStream.stream) {
    handleStreamChunk(chunk as Record<string, unknown>);
  }

  updateOutput("agentText", "\n✅ Plan created!\n");

  return;

  // Step 2: Execution - Run the Ralph loop
  updateOutput("agentText", "🔄 Phase 2: Executing tasks iteratively...\n");

  const result = await runRalphLoop({
    model: "openai/gpt-oss-120b",
    onIterationStart: (iter, task) => {
      updateOutput(
        "toolCall",
        JSON.stringify({
          action: `Ralph Iteration ${iter}`,
          details: task.title,
          result: task.description,
        })
      );
    },
    onIterationComplete: (iter, success) => {
      updateOutput(
        "agentText",
        success
          ? `  ✓ Iteration ${iter} complete\n`
          : `  ✗ Iteration ${iter} failed\n`
      );
    },
    onProjectComplete: () => {
      updateOutput("agentText", "\n🎉 All tasks completed successfully!\n");
    },
  });

  if (!result.completed) {
    updateOutput("agentText", `\n❌ Ralph stopped: ${result.error}\n`);
  }

  updateOutput(
    "agentText",
    `\n📊 Summary: ${result.iterations} iterations, ${
      result.completed ? "completed" : "incomplete"
    }\n`
  );
}

// ============================================================================
// Main Query Handler
// ============================================================================

export default async function QueryHandler(query: string) {
  if (query === "exit") {
    process.exit(0);
  }

  updateOutput("command", query);

  // Handle slash commands
  if (query.startsWith("/")) {
    // Check for Ralph mode
    if (query.startsWith("/ralph ")) {
      const goal = query.replace("/ralph ", "").trim();
      if (!goal) {
        updateOutput("agentText", "Usage: /ralph <your goal>\n");
        return;
      }
      useFraudeStore.setState({ status: 1, elapsedTime: 0, lastBreak: 0 });
      await handleRalphMode(goal);
      useFraudeStore.setState({ status: 0 });
      return;
    }

    // Other commands
    await CommandCenter.processCommand(query);
    return;
  }

  // Regular agent flow
  log(`User Query: ${query}`);
  useFraudeStore.setState({ status: 1, elapsedTime: 0, lastBreak: 0 });
  resetStreamState();

  // const agent = new Agent({
  //   model: "openai/gpt-oss-120b",
  //   systemPrompt: "You are a helpful assistant.",
  //   tools: { readTool, bashTool, writeTool, editTool },
  //   temperature: 0.7,
  // });

  const agent = new Agent({
    model: "openai/gpt-oss-120b",
    systemPrompt: "You are a helpful assistant.",
    tools: {
      readTool,
      grepTool,
      globTool,
      bashTool,
      planTool,
      writeTool,
      editTool,
    },
    temperature: 0.7,
  });

  const stream = agent.stream(query);
  for await (const chunk of stream.stream) {
    log(JSON.stringify(chunk, null, 2));
    handleStreamChunk(chunk as Record<string, unknown>);
  }

  useFraudeStore.setState({ status: 0 });
}
