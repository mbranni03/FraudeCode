import { Annotation } from "@langchain/langgraph";

export interface PendingChange {
  filePath: string;
  absPath: string;
  oldContent: string;
  newContent: string;
}

export const AgentState = Annotation.Root({
  query: Annotation<string>(),
  repoPath: Annotation<string>(),
  repoName: Annotation<string>(),
  qdrantResults: Annotation<any[]>(),
  filePaths: Annotation<string[]>(),
  structuralContext: Annotation<string>(),
  codeContext: Annotation<string>(),
  thinkingProcess: Annotation<string>(),
  modifications: Annotation<string>(),
  diffs: Annotation<string>(),
  pendingChanges: Annotation<PendingChange[]>(),
  userConfirmed: Annotation<boolean>(),
  llmContext: Annotation<{
    thinkerPromptSize: number;
    coderPromptSize: number;
  }>(),
  error: Annotation<string | undefined>(),
  status: Annotation<string>(),
});

export type AgentStateType = typeof AgentState.State;
