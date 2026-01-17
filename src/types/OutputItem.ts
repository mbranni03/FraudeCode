export type OutputItemType =
  | "log"
  | "markdown"
  | "diff"
  | "confirmation"
  | "command"
  | "done"
  | "settings"
  | "comment"
  | "error"
  | "reasoning"
  | "interrupted"
  | "toolCall"
  | "agentText";

export interface OutputItem {
  id: string;
  type: OutputItemType;
  content: string;
  duration?: number;
}
