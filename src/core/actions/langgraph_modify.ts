import { StateGraph, END, START } from "@langchain/langgraph";
import type { ChatOllama } from "@langchain/ollama";
import Neo4jClient from "../../services/neo4j";
import QdrantCli from "../../services/qdrant";
import { AgentState, type PendingChange } from "../../types/state";

// Nodes
import { createSearchQdrantNode } from "../nodes/searchQdrant";
import { createSearchNeo4jNode } from "../nodes/searchNeo4j";
import { createGatherFilesNode } from "../nodes/gatherFiles";
import { createCombineContextNode } from "../nodes/combineContext";
import { createThinkNode } from "../nodes/thinkModifications";
import { createCodeNode } from "../nodes/codeModifications";
import { createVerifyNode } from "../nodes/verify";
import { createSaveChangesNode } from "../nodes/saveChanges";

export default async function langgraphModify(
  query: string,
  neo4j: Neo4jClient,
  qdrant: QdrantCli,
  thinkerModel: ChatOllama,
  coderModel: ChatOllama,
  updateOutput: (
    type: "log" | "diff" | "confirmation" | "markdown",
    content: string,
    title?: string,
    changes?: PendingChange[]
  ) => void,
  promptUserConfirmation: () => Promise<boolean>,
  setPendingChanges: (changes: PendingChange[]) => void,
  signal?: AbortSignal
) {
  const repoName = "sample";
  const repoPath = "/Users/mbranni03/Documents/GitHub/FraudeCode/sample";

  const workflow = new StateGraph(AgentState)
    .addNode("searchQdrant", createSearchQdrantNode(qdrant, updateOutput))
    .addNode("searchNeo4j", createSearchNeo4jNode(neo4j, updateOutput))
    .addNode("gatherFiles", createGatherFilesNode(updateOutput))
    .addNode("combineContext", createCombineContextNode(updateOutput))
    .addNode("think", createThinkNode(thinkerModel, updateOutput, signal))
    .addNode("code", createCodeNode(coderModel, updateOutput, signal))
    .addNode("verify", createVerifyNode(updateOutput, setPendingChanges))
    .addNode(
      "saveChanges",
      createSaveChangesNode(updateOutput, promptUserConfirmation)
    );

  workflow.addEdge(START, "searchQdrant");
  workflow.addEdge("searchQdrant", "searchNeo4j");
  workflow.addEdge("searchNeo4j", "gatherFiles");
  workflow.addEdge("gatherFiles", "combineContext");
  workflow.addEdge("combineContext", "think");
  workflow.addEdge("think", "code");
  workflow.addEdge("code", "verify");
  workflow.addEdge("verify", "saveChanges");
  workflow.addEdge("saveChanges", END);

  const app = workflow.compile();

  const finalState = (await app.invoke(
    {
      query,
      repoName,
      repoPath,
      status: "started",
      pendingChanges: [],
      userConfirmed: false,
      llmContext: { thinkerPromptSize: 0, coderPromptSize: 0 },
    },
    { signal }
  )) as any;

  return {
    diffs: finalState.diffs,
    userConfirmed: finalState.userConfirmed,
    pendingChanges: finalState.pendingChanges || [],
  };
}
