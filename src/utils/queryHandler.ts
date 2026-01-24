import useFraudeStore from "@/store/useFraudeStore";
import CommandCenter from "@/commands";
import log from "./logger";
import { resetStreamState } from "./streamHandler";
import pendingChanges from "@/agent/pendingChanges";
import { getManagerAgent } from "@/agent/subagents/managerAgent";
import {
  getNextTodo,
  getTodoById,
  hasPendingTodos,
} from "@/agent/tools/todoTool";
import { getWorkerSubAgent } from "@/agent/subagents/workerSubAgent";
import { getReviewerSubAgent } from "@/agent/subagents/reviewerSubAgent";
import type { TodoItem } from "@/agent/tools/todoTool";

const { updateOutput } = useFraudeStore.getState();

const getTaskContext = (task: TodoItem) => {
  const context = task.context;
  const notes = task.notes;

  return `Task: ${task.description}

Context:
${context ? `Files: ${context.files.join(", ")}\nInstructions: ${context.instructions}` : "No pre-researched context provided."}

Notes:
${notes.length > 0 ? notes.map((n, i) => `${i + 1}. ${n}`).join("\n") : "None"}`;
};

export default async function QueryHandler(query: string) {
  if (query === "exit") {
    process.exit(0);
  }
  updateOutput("command", query);
  if (query.startsWith("/")) {
    await CommandCenter.processCommand(query);
    return;
  }
  log(`User Query: ${query}`);

  // Create an AbortController for this query
  const abortController = new AbortController();
  useFraudeStore.setState({
    status: 1,
    elapsedTime: 0,
    lastBreak: 0,
    abortController,
    statusText: "Pondering",
  });
  resetStreamState();

  // Helper that throws if interrupted - call between async operations
  const checkAbort = () => {
    if (abortController.signal.aborted) {
      const error = new Error("Aborted");
      error.name = "AbortError";
      throw error;
    }
  };

  try {
    const response = await getManagerAgent().stream(query, {
      abortSignal: abortController.signal,
    });
    checkAbort();
    useFraudeStore.setState({
      researchCache: {},
    });

    log("Manager Response:");
    log(JSON.stringify(response, null, 2));

    // Validate that manager created at least one todo
    const hasTodos = await hasPendingTodos();
    if (!hasTodos) {
      log("Error: Manager completed without creating any tasks");
      updateOutput(
        "error",
        "The planning agent completed without creating any tasks. This may indicate the model got stuck in a loop. Please try rephrasing your request or using a different model.",
      );
      return;
    }

    let nextTask = await getNextTodo();
    while (!nextTask.done && nextTask.task) {
      checkAbort();

      let taskContext = getTaskContext(nextTask.task);
      const response = await getWorkerSubAgent().stream(taskContext, {
        abortSignal: abortController.signal,
      });
      checkAbort();

      log("Worker Response:");
      log(JSON.stringify(response, null, 2));
      const getUpdatedTask = await getTodoById(nextTask.task.id);
      if (!getUpdatedTask) {
        updateOutput("error", "Task not found");
        continue;
      }
      taskContext = getTaskContext(getUpdatedTask);
      const reviewResponse = await getReviewerSubAgent().stream(taskContext, {
        abortSignal: abortController.signal,
      });
      checkAbort();

      log("Review Response:");
      log(JSON.stringify(reviewResponse, null, 2));
      nextTask = await getNextTodo();
    }

    if (pendingChanges.hasChanges()) {
      useFraudeStore.setState({ status: 3, statusText: "Reviewing Changes" });
      updateOutput("confirmation", JSON.stringify({}));
    } else {
      updateOutput("done", "Task Completed");
    }
  } catch (e: any) {
    if (e?.name === "AbortError" || e?.message === "Aborted") {
      log("Query aborted by user");
    } else {
      log(`Error in query handler: ${e?.message}`);
      throw e; // Re-throw non-abort errors
    }
  } finally {
    // Cleanup unless in reviewing mode
    if (useFraudeStore.getState().status !== 3) {
      useFraudeStore.setState({
        status: 0,
        abortController: null,
        statusText: "",
      });
    }
  }
}
