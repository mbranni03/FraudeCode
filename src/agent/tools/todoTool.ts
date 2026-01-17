import { tool } from "ai";
import { z } from "zod";
import path from "path";
import useFraudeStore from "@/store/useFraudeStore";
import DESCRIPTION from "./descriptions/todo.txt";

const { updateOutput } = useFraudeStore.getState();

// Path configuration
const FRAUDE_DIR = path.join(process.cwd(), ".fraude");
const TODOS_FILE = path.join(FRAUDE_DIR, "todos.json");

// Todo item schema
interface TodoItem {
  id: string;
  description: string;
  status: "pending" | "in-progress" | "completed";
  iteration: number;
  notes: string[];
  createdAt: string;
  updatedAt: string;
}

interface TodoState {
  currentIteration: number;
  todos: TodoItem[];
}

// Helper to read current todos
async function readTodos(): Promise<TodoState> {
  const file = Bun.file(TODOS_FILE);
  if (await file.exists()) {
    const text = await file.text();
    return JSON.parse(text);
  }
  return { currentIteration: 1, todos: [] };
}

// Helper to write todos
async function writeTodos(state: TodoState): Promise<void> {
  await Bun.write(TODOS_FILE, JSON.stringify(state, null, 2));
}

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

const todoTool = tool({
  description: DESCRIPTION,
  inputSchema: z.object({
    operation: z
      .enum(["add", "update", "complete", "list", "clear", "next-iteration"])
      .describe("The operation to perform"),
    id: z
      .string()
      .optional()
      .describe("Task ID (required for update/complete)"),
    description: z
      .string()
      .optional()
      .describe("Task description (required for add)"),
    status: z
      .enum(["pending", "in-progress", "completed"])
      .optional()
      .describe("New status (for update operation)"),
    note: z
      .string()
      .optional()
      .describe("Note to append (for worker summaries or reviewer feedback)"),
  }),
  execute: async ({ operation, id, description, status, note }) => {
    const state = await readTodos();
    const now = new Date().toISOString();
    let result: unknown;

    switch (operation) {
      case "add": {
        if (!description)
          throw new Error("Description required for add operation");
        const newTodo: TodoItem = {
          id: generateId(),
          description,
          status: "pending",
          iteration: state.currentIteration,
          notes: note ? [note] : [],
          createdAt: now,
          updatedAt: now,
        };
        state.todos.push(newTodo);
        await writeTodos(state);
        result = { success: true, todo: newTodo };
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Added Todo",
            details: description,
            result: newTodo.id,
          }),
          { dontOverride: true }
        );
        break;
      }

      case "update": {
        if (!id) throw new Error("ID required for update operation");
        const todo = state.todos.find((t) => t.id === id);
        if (!todo) throw new Error(`Todo not found: ${id}`);
        if (status) todo.status = status;
        if (note) todo.notes.push(`[Iter ${state.currentIteration}] ${note}`);
        todo.updatedAt = now;
        await writeTodos(state);
        result = { success: true, todo };
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Updated Todo",
            details: todo.description,
            result: status || "note added",
          }),
          { dontOverride: true }
        );
        break;
      }

      case "complete": {
        if (!id) throw new Error("ID required for complete operation");
        const todo = state.todos.find((t) => t.id === id);
        if (!todo) throw new Error(`Todo not found: ${id}`);
        todo.status = "completed";
        todo.updatedAt = now;
        if (note) todo.notes.push(`[Completed] ${note}`);
        await writeTodos(state);
        result = { success: true, todo };
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Completed Todo",
            details: todo.description,
            result: "✓",
          }),
          { dontOverride: true }
        );
        break;
      }

      case "list": {
        result = {
          iteration: state.currentIteration,
          todos: state.todos,
          summary: {
            total: state.todos.length,
            pending: state.todos.filter((t) => t.status === "pending").length,
            inProgress: state.todos.filter((t) => t.status === "in-progress")
              .length,
            completed: state.todos.filter((t) => t.status === "completed")
              .length,
          },
        };
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Listed Todos",
            details: `Iteration ${state.currentIteration}`,
            result: `${state.todos.length} tasks`,
          }),
          { dontOverride: true }
        );
        break;
      }

      case "clear": {
        state.todos = state.todos.filter((t) => t.status !== "completed");
        await writeTodos(state);
        result = { success: true, remaining: state.todos.length };
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Cleared Completed",
            details: `${state.todos.length} remaining`,
            result: "✓",
          }),
          { dontOverride: true }
        );
        break;
      }

      case "next-iteration": {
        state.currentIteration += 1;
        await writeTodos(state);
        result = { success: true, iteration: state.currentIteration };
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Next Iteration",
            details: `Now on iteration ${state.currentIteration}`,
            result: "✓",
          }),
          { dontOverride: true }
        );
        break;
      }
    }

    return result;
  },
});

export default todoTool;
