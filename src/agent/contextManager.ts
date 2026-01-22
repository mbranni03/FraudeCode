import type { ModelMessage, StepResult, ToolSet } from "ai";

class ContextManager {
  private longTermSummary: string = "";
  private history: ModelMessage[] = [];

  constructor(initialContext: ModelMessage[] = []) {
    this.history = initialContext;
  }

  getContext(): ModelMessage[] {
    return this.history;
  }

  clearContext() {
    this.history = [];
    this.longTermSummary = "";
  }

  processStep = (step: StepResult<ToolSet>) => {
    if (step.response?.messages) {
      this.addHistory(step.response.messages);
    }
  };

  async addHistory(query: string | ModelMessage | ModelMessage[]) {
    if (typeof query === "string") {
      this.history.push({ role: "user", content: query });
    } else if (Array.isArray(query)) {
      this.history.push(...query);
    } else {
      this.history.push(query);
    }
    return this.history;
  }

  // Backward compatibility alias
  addContext(query: string | ModelMessage | ModelMessage[]) {
    return this.addHistory(query);
  }

  estimateContextTokens() {
    return (
      this.getContext().reduce(
        (total, message) => total + this.estimateMessageTokens(message),
        0,
      ) + this.estimateMessageTokens(this.longTermSummary)
    );
  }

  estimateMessageTokens(message: ModelMessage | string) {
    const text =
      typeof message === "string" ? message : (message.content as string);
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
