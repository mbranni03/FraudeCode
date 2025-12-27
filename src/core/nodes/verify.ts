import type { AgentStateType, PendingChange } from "../../types/state";
import { applyTargetedChanges } from "../modification/CodeModifier";

export const createVerifyNode = (
  updateOutput: (
    type: "log" | "diff",
    content: string,
    title?: string,
    changes?: PendingChange[]
  ) => void,
  setPendingChanges: (changes: PendingChange[]) => void
) => {
  return async (state: AgentStateType) => {
    updateOutput("log", "📉 [DIFF] Computing changes...");

    const pendingChanges = applyTargetedChanges(
      state.modifications,
      state.repoPath,
      updateOutput as any
    );

    updateOutput(
      "log",
      `[verifyNode] Computed ${pendingChanges.length} pending changes:`
    );
    for (const change of pendingChanges) {
      updateOutput("log", `  - ${change.filePath} -> ${change.absPath}`);
    }

    setPendingChanges(pendingChanges);

    updateOutput("diff", "", "Code Changes", pendingChanges);

    updateOutput("log", `${pendingChanges.length} change(s) computed.`);

    return {
      pendingChanges,
      status: "awaiting_confirmation",
    };
  };
};
