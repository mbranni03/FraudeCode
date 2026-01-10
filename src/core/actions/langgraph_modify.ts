import { StateGraph, END, START } from "@langchain/langgraph";
import { ModifierState, type ModifierStateType } from "../../types/state";

// Nodes
import { createSearchQdrantNode } from "../agent/nodes/searchQdrant";
import { createSearchNeo4jNode } from "../agent/nodes/searchNeo4j";
import { createCombineContextNode } from "../agent/nodes/combineContext";
import { createImplementationPlanNode } from "../agent/nodes/implementationPlan";
import { createCodeNode } from "../agent/nodes/codeModifications";
import { createVerifyNode } from "../agent/nodes/verify";
import { createSaveChangesNode } from "../agent/nodes/saveChanges";
import { createUpdateRagNode } from "../agent/nodes/updateRag";
import { useFraudeStore } from "../../store/useFraudeStore";

export default async function langgraphModify(
  query: string,
  promptUserConfirmation: () => Promise<boolean>,
  signal?: AbortSignal
) {
  const repoName = "sample";
  const repoPath = "/Users/mbranni03/Documents/GitHub/FraudeCode/sample";

  const workflow = new StateGraph(ModifierState)
    .addNode("searchQdrant", createSearchQdrantNode())
    .addNode("searchNeo4j", createSearchNeo4jNode())
    .addNode("combineContext", createCombineContextNode())
    .addNode("think", createImplementationPlanNode()) // Thinking
    .addNode("code", createCodeNode()) // Thinking skipped if fastChanges
    .addNode("verify", createVerifyNode())
    .addNode("saveChanges", createSaveChangesNode(promptUserConfirmation))
    .addNode("updateRag", createUpdateRagNode());

  workflow.addEdge(START, "searchQdrant");
  workflow.addEdge("searchQdrant", "searchNeo4j");
  workflow.addEdge("searchNeo4j", "combineContext");
  workflow.addEdge("think", "code");
  workflow.addEdge("code", "verify");
  workflow.addEdge("verify", "saveChanges");
  workflow.addEdge("updateRag", END);
  workflow.addConditionalEdges(
    "saveChanges",
    (state: ModifierStateType) => {
      if (state.userConfirmed) {
        return "updateRag";
      }
      return END;
    },
    {
      [END]: END,
      updateRag: "updateRag",
    }
  );
  // Execution mode pathing
  workflow.addConditionalEdges(
    "combineContext",
    () => {
      return useFraudeStore.getState().executionMode;
    },
    {
      Fast: "code",
      Planning: "think",
    }
  );

  const app = workflow.compile();

  const finalState = (await app.invoke(
    {
      id: useFraudeStore.getState().currentInteractionId || "",
      query,
      repoName,
      repoPath,
      status: "started",
      pendingChanges: [],
      userConfirmed: false,
    },
    { signal }
  )) as any;

  return {
    diffs: finalState.diffs,
    userConfirmed: finalState.userConfirmed,
    pendingChanges: finalState.pendingChanges || [],
  };
}
