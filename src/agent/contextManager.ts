import type { ModelMessage, StepResult, ToolSet } from "ai";

// CONTEXT ORDER
/**
 * 1. Task Content
 * 2. Tone
 * 3. Data/Docs
 * 4. Rules
 * 5. Examples
 * 6. History
 * 7. Immediate Request
 * 8. Think step by step
 * 9. Format
 */

type ContextCategory =
  | "task"
  | "tone"
  | "docs"
  | "rules"
  | "examples"
  | "request"
  | "reasoning"
  | "format";

const CONTEXT_ORDER: ContextCategory[] = [
  "task",
  "tone",
  "docs",
  "rules",
  "examples",
  "request",
  "reasoning",
  "format",
];

class ContextManager {
  private slots: Partial<Record<ContextCategory, string>> = {};
  private history: ModelMessage[] = [];

  constructor(initialContext: ModelMessage[] = []) {
    this.history = initialContext;
  }

  getContext(): ModelMessage[] {
    const ordered = CONTEXT_ORDER.map((cat) => this.slots[cat])
      .filter(Boolean)
      .map((content) => ({ role: "system", content }) as ModelMessage);
    return [...ordered, ...this.history];
  }

  clearContext() {
    this.slots = {};
    this.history = [];
  }

  processStep = (step: StepResult<ToolSet>) => {
    if (step.response?.messages) {
      this.addHistory(step.response.messages);
    }
  };

  setSlot(category: ContextCategory, content: string) {
    this.slots[category] = content;
  }

  addHistory(query: string | ModelMessage | ModelMessage[]) {
    if (typeof query === "string") {
      this.history.push({ role: "user", content: query });
    } else if (Array.isArray(query)) {
      this.history.push(...query);
    } else {
      this.history.push(query);
    }
    return this.getContext();
  }

  // Backward compatibility alias
  addContext(query: string | ModelMessage | ModelMessage[]) {
    return this.addHistory(query);
  }

  estimateContextTokens() {
    return this.getContext().reduce(
      (total, message) => total + this.estimateMessageTokens(message),
      0,
    );
  }

  estimateMessageTokens(message: ModelMessage) {
    const text = message.content as string;
    if (/[\u4E00-\u9FFF]/.test(text)) {
      return Math.ceil(text.length / 2); // CJK safety
    }
    if (/[\p{Emoji}]/u.test(text)) {
      return Math.ceil(text.length); // worst-case
    }
    return Math.ceil(text.length / 4);
  }
}

export default ContextManager;
export type { ContextCategory };
