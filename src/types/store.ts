import type { PendingChange } from "./state";

export type OutputItemType =
  | "log"
  | "markdown"
  | "diff"
  | "confirmation"
  | "command"
  | "checkpoint"
  | "settings"
  | "comment"
  | "error";

export interface TokenUsage {
  total: number;
  prompt: number;
  completion: number;
}

export interface OutputItem {
  id: string;
  type: OutputItemType;
  content: string;
  title?: string;
  changes?: PendingChange[];
}

export interface InteractionState {
  interactionId: string;
  status: number; // 0 = idle, 1 = loading, 2 = done, -1 = interrupted, 3 = awaiting confirmation, 4 = awaiting implementation comment
  outputItems: OutputItem[];
  tokenUsage: TokenUsage;
  elapsedTime: number;
  pendingChanges: PendingChange[];
  statusText?: string;
  lastBreak: number;
  timeElapsed: number;
  settingsInteraction: boolean;
}
