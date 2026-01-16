import { tool } from "ai";
import { z } from "zod";
import useFraudeStore from "@/store/useFraudeStore";
import {
  getNextTask,
  setCurrentTask,
  updateUserStory,
  isProjectComplete,
} from "@/utils/ralphState";
import DESCRIPTION from "./descriptions/taskPicker.txt";

const { updateOutput } = useFraudeStore.getState();

const taskPickerTool = tool({
  description: DESCRIPTION,
  inputSchema: z.object({}),
  execute: async () => {
    try {
      // Check if project is complete
      if (await isProjectComplete()) {
        updateOutput(
          "toolCall",
          JSON.stringify({
            action: "Task Picker",
            details: "All tasks complete",
            result: "Project finished!",
          })
        );
        return {
          complete: true,
          message: "All tasks have been completed!",
          task: null,
        };
      }

      // Get next pending task
      const task = await getNextTask();

      if (!task) {
        return {
          complete: true,
          message: "No pending tasks found",
          task: null,
        };
      }

      // Mark task as in-progress
      await updateUserStory(task.id, { status: "in-progress" });
      await setCurrentTask(task.id);

      updateOutput(
        "toolCall",
        JSON.stringify({
          action: "Picked Task",
          details: task.title,
          result: task.description,
        })
      );

      return {
        complete: false,
        message: `Starting task: ${task.title}`,
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          acceptanceCriteria: task.acceptanceCriteria,
          priority: task.priority,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to pick task: ${message}`);
    }
  },
});

export default taskPickerTool;
