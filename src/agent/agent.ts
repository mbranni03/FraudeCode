import {
  generateText,
  streamText,
  Output,
  stepCountIs,
  type ModelMessage,
} from "ai";
import { getModel } from "@/providers/providers";
import type {
  AgentConfig,
  AgentResponse,
  StreamingAgentResponse,
  StructuredAgentResponse,
  StructuredSchema,
  ToolCallInfo,
  ToolResultInfo,
  StepInfo,
  SimpleMessage,
  AgentUsage,
} from "@/types/Agent";

// ============================================================================
// Helper to extract usage from SDK response
// ============================================================================

function extractUsage(usage: unknown): AgentUsage {
  if (usage && typeof usage === "object") {
    const u = usage as Record<string, unknown>;
    return {
      promptTokens: typeof u.inputTokens === "number" ? u.inputTokens : 0,
      completionTokens: typeof u.outputTokens === "number" ? u.outputTokens : 0,
      totalTokens:
        (typeof u.inputTokens === "number" ? u.inputTokens : 0) +
        (typeof u.outputTokens === "number" ? u.outputTokens : 0),
    };
  }
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

// ============================================================================
// Agent Class
// ============================================================================

/**
 * A provider-agnostic Agent class that provides a unified interface for
 * interacting with various LLM providers (Groq, Ollama, OpenRouter, etc.)
 *
 * @example
 * ```typescript
 * const agent = new Agent({
 *   model: "llama3.1:latest",
 *   systemPrompt: "You are a helpful assistant.",
 *   temperature: 0.7,
 * });
 *
 * // Simple chat
 * const response = await agent.chat("Hello, how are you?");
 *
 * // With conversation history
 * const response = await agent.chat([
 *   { role: "user", content: "Hello" },
 *   { role: "assistant", content: "Hi there!" },
 *   { role: "user", content: "What's the weather?" }
 * ]);
 *
 * // Streaming
 * const stream = agent.stream("Tell me a story");
 * for await (const chunk of stream.textStream) {
 *   process.stdout.write(chunk);
 * }
 * ```
 */
export default class Agent {
  private config: AgentConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private model: any;
  private conversationHistory: ModelMessage[] = [];

  constructor(config: AgentConfig) {
    this.config = {
      temperature: 0.7,
      maxTokens: 4096,
      maxSteps: 5,
      autoExecuteTools: true,
      ...config,
    };
    this.model = getModel(config.model);
  }

  // ==========================================================================
  // Core Methods
  // ==========================================================================

  /**
   * Send a message and get a complete response.
   * Supports both simple string input and full message history.
   */
  async chat(
    input: string | SimpleMessage[] | ModelMessage[],
    options?: Partial<AgentConfig>
  ): Promise<AgentResponse> {
    const messages = this.buildMessages(input);
    const mergedConfig = { ...this.config, ...options };

    const result = await generateText({
      model: this.model as Parameters<typeof generateText>[0]["model"],
      messages,
      system: mergedConfig.systemPrompt,
      temperature: mergedConfig.temperature,
      maxOutputTokens: mergedConfig.maxTokens,
      tools: mergedConfig.tools,
      stopWhen: mergedConfig.maxSteps
        ? stepCountIs(mergedConfig.maxSteps)
        : undefined,
      onStepFinish: (step) => {
        if (mergedConfig.onStepComplete) {
          mergedConfig.onStepComplete(this.mapStepInfo(step));
        }
      },
    });

    // Update conversation history
    this.conversationHistory = [...messages, ...result.response.messages];

    return this.mapResponse(result);
  }

  /**
   * Stream a response in real-time.
   * Returns an async iterable for text chunks and a promise for the full response.
   */
  stream(
    input: string | SimpleMessage[] | ModelMessage[],
    options?: Partial<AgentConfig>
  ): StreamingAgentResponse {
    const messages = this.buildMessages(input);
    const mergedConfig = { ...this.config, ...options };

    const result = streamText({
      model: this.model as Parameters<typeof streamText>[0]["model"],
      messages,
      system: mergedConfig.systemPrompt,
      temperature: mergedConfig.temperature,
      maxOutputTokens: mergedConfig.maxTokens,
      tools: mergedConfig.tools,
      stopWhen: mergedConfig.maxSteps
        ? stepCountIs(mergedConfig.maxSteps)
        : undefined,
      onChunk: ({ chunk }) => {
        if (chunk.type === "text-delta" && mergedConfig.onTextChunk) {
          mergedConfig.onTextChunk(chunk.text);
        }
      },
      onStepFinish: (step) => {
        if (mergedConfig.onStepComplete) {
          mergedConfig.onStepComplete(this.mapStepInfo(step));
        }
      },
    });

    return {
      textStream: result.textStream,
      response: this.buildStreamingResponse(result, messages),
    };
  }

  /**
   * Generate a structured object that conforms to a Zod schema.
   * Useful for extracting data, function calling, or typed responses.
   *
   * @example
   * ```typescript
   * const schema = z.object({
   *   name: z.string(),
   *   age: z.number(),
   * });
   *
   * const result = await agent.generate("John is 25 years old", schema);
   * console.log(result.object); // { name: "John", age: 25 }
   * ```
   */
  async generate<T>(
    input: string | SimpleMessage[] | ModelMessage[],
    schema: StructuredSchema<T>,
    options?: Partial<AgentConfig> & {
      schemaName?: string;
      schemaDescription?: string;
    }
  ): Promise<StructuredAgentResponse<T>> {
    const messages = this.buildMessages(input);
    const mergedConfig = { ...this.config, ...options };

    const result = await generateText({
      model: this.model as Parameters<typeof generateText>[0]["model"],
      messages,
      system: mergedConfig.systemPrompt,
      temperature: mergedConfig.temperature,
      maxOutputTokens: mergedConfig.maxTokens,
      output: Output.object({
        schema,
        name: options?.schemaName,
        description: options?.schemaDescription,
      }),
    });

    return {
      object: result.output as T,
      usage: extractUsage(result.usage),
      finishReason: result.finishReason ?? "unknown",
      raw: result,
    };
  }

  // ==========================================================================
  // Conversation Management
  // ==========================================================================

  /**
   * Get the current conversation history
   */
  getHistory(): ModelMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Clear the conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Add a message to the conversation history
   */
  addMessage(message: ModelMessage): void {
    this.conversationHistory.push(message);
  }

  /**
   * Set the entire conversation history
   */
  setHistory(messages: ModelMessage[]): void {
    this.conversationHistory = [...messages];
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Update the agent's configuration
   */
  configure(options: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...options };

    // If model changed, update the model instance
    if (options.model) {
      this.model = getModel(options.model);
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * Switch to a different model
   */
  setModel(modelName: string): void {
    this.config.model = modelName;
    this.model = getModel(modelName);
  }

  /**
   * Update the system prompt
   */
  setSystemPrompt(prompt: string): void {
    this.config.systemPrompt = prompt;
  }

  /**
   * Register tools for the agent to use
   */
  setTools(tools: AgentConfig["tools"]): void {
    this.config.tools = tools;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private buildMessages(
    input: string | SimpleMessage[] | ModelMessage[]
  ): ModelMessage[] {
    if (typeof input === "string") {
      return [
        ...this.conversationHistory,
        { role: "user", content: input } as ModelMessage,
      ];
    }

    // Check if it's already ModelMessage[] format
    if (Array.isArray(input) && input.length > 0) {
      return input as ModelMessage[];
    }

    return this.conversationHistory;
  }

  private mapResponse(
    result: Awaited<ReturnType<typeof generateText>>
  ): AgentResponse {
    const steps: StepInfo[] =
      result.steps?.map((step, index) =>
        this.mapStepInfo({ ...step, stepNumber: index + 1 })
      ) ?? [];
    const toolCalls: ToolCallInfo[] = [];
    const toolResults: ToolResultInfo[] = [];

    // Aggregate all tool calls/results from steps
    for (const step of steps) {
      toolCalls.push(...step.toolCalls);
      toolResults.push(...step.toolResults);
    }

    return {
      text: result.text,
      usage: extractUsage(result.usage),
      finishReason: result.finishReason ?? "unknown",
      steps,
      toolCalls,
      toolResults,
      raw: result,
    };
  }

  private mapStepInfo(step: Record<string, unknown>): StepInfo {
    const toolCalls = step.toolCalls as
      | Array<Record<string, unknown>>
      | undefined;
    const toolResults = step.toolResults as
      | Array<Record<string, unknown>>
      | undefined;

    return {
      stepNumber: (step.stepNumber as number) ?? 0,
      text: (step.text as string) ?? "",
      toolCalls:
        toolCalls?.map((tc) => ({
          toolCallId: tc.toolCallId as string,
          toolName: tc.toolName as string,
          args: tc.args,
        })) ?? [],
      toolResults:
        toolResults?.map((tr) => ({
          toolCallId: tr.toolCallId as string,
          toolName: tr.toolName as string,
          result: tr.result,
        })) ?? [],
      finishReason: (step.finishReason as string) ?? "unknown",
    };
  }

  private async buildStreamingResponse(
    result: ReturnType<typeof streamText>,
    messages: ModelMessage[]
  ): Promise<AgentResponse> {
    // Wait for the stream to complete
    const finalResult = await result;

    // Update conversation history
    const responseMessages = await result.response;
    this.conversationHistory = [...messages, ...responseMessages.messages];

    const text = await result.text;
    const usage = await result.usage;
    const finishReason = await result.finishReason;
    const steps = await result.steps;

    const mappedSteps: StepInfo[] =
      steps?.map((step, index) =>
        this.mapStepInfo({ ...step, stepNumber: index + 1 })
      ) ?? [];
    const toolCalls: ToolCallInfo[] = [];
    const toolResults: ToolResultInfo[] = [];

    for (const step of mappedSteps) {
      toolCalls.push(...step.toolCalls);
      toolResults.push(...step.toolResults);
    }

    return {
      text,
      usage: extractUsage(usage),
      finishReason: finishReason ?? "unknown",
      steps: mappedSteps,
      toolCalls,
      toolResults,
      raw: finalResult,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an agent with a specific role/persona
 */
export function createAgent(config: AgentConfig): Agent {
  return new Agent(config);
}

/**
 * Create a quick agent for one-off interactions (no conversation memory)
 */
export async function quickChat(
  model: string,
  prompt: string,
  options?: Partial<Omit<AgentConfig, "model">>
): Promise<string> {
  const agent = new Agent({ model, ...options });
  const response = await agent.chat(prompt);
  return response.text;
}

/**
 * Create an agent optimized for reasoning/thinking tasks
 */
export function createThinker(
  model: string,
  options?: Partial<AgentConfig>
): Agent {
  return new Agent({
    model,
    temperature: 0.3,
    systemPrompt: `You are a careful, analytical thinker. Take your time to reason through problems step by step. Consider multiple perspectives and potential edge cases before arriving at a conclusion.`,
    ...options,
  });
}

/**
 * Create an agent optimized for creative tasks
 */
export function createCreative(
  model: string,
  options?: Partial<AgentConfig>
): Agent {
  return new Agent({
    model,
    temperature: 0.9,
    systemPrompt: `You are a creative assistant with a flair for imagination and originality. Think outside the box and offer unique, engaging ideas.`,
    ...options,
  });
}
