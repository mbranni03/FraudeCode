import {
  generateText,
  streamText,
  Output,
  stepCountIs,
  NoSuchToolError,
  type ModelMessage,
  type TextStreamPart,
  type ToolSet,
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
} from "@/types/Agent";
import log from "@/utils/logger";
import useFraudeStore from "@/store/useFraudeStore";
import { incrementModelUsage } from "@/config/settings";
import type { TokenUsage } from "@/types/TokenUsage";

// ============================================================================
// Helper to extract usage from SDK response
// ============================================================================

function extractUsage(usage: unknown): TokenUsage {
  if (usage && typeof usage === "object") {
    const u = usage as Record<string, unknown>;
    return {
      prompt: typeof u.inputTokens === "number" ? u.inputTokens : 0,
      completion: typeof u.outputTokens === "number" ? u.outputTokens : 0,
      total:
        (typeof u.inputTokens === "number" ? u.inputTokens : 0) +
        (typeof u.outputTokens === "number" ? u.outputTokens : 0),
    };
  }
  return { prompt: 0, completion: 0, total: 0 };
}

// ============================================================================
// Rate Limit Handling
// ============================================================================

const RATE_LIMIT_RETRY_DELAY_MS = 60000; // 60 seconds - wait for TPM limit to reset
const MAX_RATE_LIMIT_RETRIES = 3;

/**
 * Check if an error is a rate limit error (429 or TPM limit)
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Check for 429 status or TPM limit messages
    if (
      message.includes("429") ||
      message.includes("rate limit") ||
      message.includes("tokens per minute") ||
      message.includes("tpm") ||
      message.includes("request too large") ||
      message.includes("too many requests")
    ) {
      return true;
    }
  }
  // Check if error has a status property (API response errors)
  if (error && typeof error === "object" && "status" in error) {
    return (error as { status: number }).status === 429;
  }
  return false;
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with rate limit retry logic.
 * If all retries fail, prompts the user to select an alternative model.
 *
 * @param fn - The function to execute (should use currentModel from getModel callback)
 * @param currentModelName - The current model name for error reporting
 * @param onModelChange - Callback when user selects a new model (should update internal state and return new fn)
 */
async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  currentModelName: string,
  onModelChange?: (newModelName: string) => () => Promise<T>,
  retries = MAX_RATE_LIMIT_RETRIES,
): Promise<T> {
  let lastError: unknown;
  let currentFn = fn;
  let modelName = currentModelName;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await currentFn();
    } catch (error) {
      lastError = error;

      if (isRateLimitError(error) && attempt < retries) {
        const waitTime = RATE_LIMIT_RETRY_DELAY_MS;
        log(
          `Rate limit hit. Waiting ${waitTime / 1000} seconds before retry ${attempt + 1}/${retries}...`,
        );
        useFraudeStore.setState({
          statusText: `Rate limited - waiting ${waitTime / 1000}s (retry ${attempt + 1}/${retries})`,
        });
        await sleep(waitTime);
        continue;
      }

      // If it's a rate limit error and we've exhausted retries, offer model selection
      if (isRateLimitError(error) && onModelChange) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        log(
          `Rate limit retries exhausted. Prompting user for model selection...`,
        );

        const selectedModel = await useFraudeStore
          .getState()
          .requestModelSelection(modelName, errorMessage);

        if (selectedModel) {
          log(`User selected alternative model: ${selectedModel}`);
          // Get new function with updated model
          currentFn = onModelChange(selectedModel);
          modelName = selectedModel;
          // Reset retries for the new model
          attempt = -1; // Will become 0 after continue
          continue;
        } else {
          // User cancelled
          throw new Error(
            `Request cancelled by user after rate limit on model: ${modelName}`,
          );
        }
      }

      throw error;
    }
  }

  throw lastError;
}

// ============================================================================
// Tool Call Repair Handler
// ============================================================================

/**
 * Creates a repair handler for tool calls that returns a helpful error message
 * when the model tries to call a tool that doesn't exist, instead of failing.
 */
function createToolCallRepairHandler(availableTools: ToolSet | undefined) {
  return async ({
    toolCall,
    error,
  }: {
    toolCall: { toolName: string };
    tools: ToolSet;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: any;
  }) => {
    // If it's a NoSuchToolError, return a "repaired" call that provides feedback
    if (NoSuchToolError.isInstance(error)) {
      const availableToolNames = availableTools
        ? Object.keys(availableTools).join(", ")
        : "none";

      log(
        `Tool repair: Model tried to call unknown tool '${toolCall.toolName}'. Available: ${availableToolNames}`,
      );

      // Return null to skip this tool call and let the error be sent back to the model
      // The model will see the error in the next step and can correct itself
      return null;
    }

    // For other errors, don't repair - let them propagate
    throw error;
  };
}

// ============================================================================
// Provider Options Builder
// ============================================================================

/**
 * Build provider options object for generateText/streamText calls.
 * Currently supports OpenAI-specific options like reasoningEffort.
 */
function buildProviderOptions(
  config: Partial<AgentConfig>,
): Record<string, Record<string, string | number | boolean>> | undefined {
  const openaiOptions: Record<string, string | number | boolean> = {};

  // Add reasoning effort if specified
  if (config.reasoningEffort) {
    openaiOptions.reasoningEffort = config.reasoningEffort;
  }

  // Only return providerOptions if we have something to set
  if (Object.keys(openaiOptions).length > 0) {
    return {
      openai: openaiOptions,
    };
  }

  return undefined;
}

// ============================================================================
// Agent Class
// ============================================================================

/**
 * A provider-agnostic Agent class that provides a unified interface for
 * interacting with various LLM providers (Groq, Ollama, OpenRouter, etc.)
 */
export default class Agent {
  private config: AgentConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private model: any;

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
    input: string,
    options?: Partial<AgentConfig>,
  ): Promise<AgentResponse> {
    const contextManager = useFraudeStore.getState().contextManager;
    const messages = contextManager.addContext(input);
    const mergedConfig = { ...this.config, ...options };

    const result = await withRateLimitRetry(
      async () => {
        return await generateText({
          model: this.model as Parameters<typeof generateText>[0]["model"],
          messages,
          system: mergedConfig.systemPrompt,
          temperature: mergedConfig.temperature,
          maxOutputTokens: mergedConfig.maxTokens,
          tools: mergedConfig.tools,
          providerOptions: buildProviderOptions(mergedConfig),
          stopWhen: mergedConfig.maxSteps
            ? stepCountIs(mergedConfig.maxSteps)
            : undefined,
          experimental_repairToolCall: createToolCallRepairHandler(
            mergedConfig.tools,
          ),
          onStepFinish: (step) => {
            if (mergedConfig.onStepComplete) {
              mergedConfig.onStepComplete(this.mapStepInfo(step));
            }
          },
        });
      },
      this.config.model,
      (newModelName) => {
        this.setModel(newModelName);
        return async () => {
          return await generateText({
            model: this.model as Parameters<typeof generateText>[0]["model"],
            messages,
            system: mergedConfig.systemPrompt,
            temperature: mergedConfig.temperature,
            maxOutputTokens: mergedConfig.maxTokens,
            tools: mergedConfig.tools,
            providerOptions: buildProviderOptions(mergedConfig),
            stopWhen: mergedConfig.maxSteps
              ? stepCountIs(mergedConfig.maxSteps)
              : undefined,
            experimental_repairToolCall: createToolCallRepairHandler(
              mergedConfig.tools,
            ),
            onStepFinish: (step) => {
              if (mergedConfig.onStepComplete) {
                mergedConfig.onStepComplete(this.mapStepInfo(step));
              }
            },
          });
        };
      },
    );

    // Update conversation history
    contextManager.addContext(result.response.messages);

    const response = this.mapResponse(result);
    await incrementModelUsage(this.model, response.usage);
    return response;
  }

  /**
   * Stream a response in real-time.
   * Returns an async iterable for text chunks and a promise for the full response.
   */
  stream(
    input: string,
    options?: Partial<AgentConfig>,
  ): StreamingAgentResponse {
    const contextManager = useFraudeStore.getState().contextManager;
    const messages = contextManager.addContext(input);
    const mergedConfig = { ...this.config, ...options };

    const result = streamText({
      model: this.model as Parameters<typeof streamText>[0]["model"],
      messages,
      system: mergedConfig.systemPrompt,
      temperature: mergedConfig.temperature,
      maxOutputTokens: mergedConfig.maxTokens,
      tools: mergedConfig.tools,
      abortSignal: mergedConfig.abortSignal,
      providerOptions: buildProviderOptions(mergedConfig),
      stopWhen: mergedConfig.maxSteps
        ? stepCountIs(mergedConfig.maxSteps)
        : undefined,
      experimental_repairToolCall: createToolCallRepairHandler(
        mergedConfig.tools,
      ),
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
      stream: this.createRetryableStream(
        result.fullStream,
        input,
        options,
      ) as StreamingAgentResponse["stream"],
      response: this.buildStreamingResponse(result, messages),
    };
  }

  /**
   * Create a stream wrapper that handles rate limit errors with retry logic.
   * If a rate limit error occurs during streaming, it waits and retries.
   * After exhausting retries, prompts user for model selection.
   */
  private createRetryableStream<T>(
    originalStream: AsyncIterable<T>,
    input: string,
    options?: Partial<AgentConfig>,
    retryCount = 0,
  ): AsyncIterable<T> {
    const self = this;

    return {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        const iterator = originalStream[Symbol.asyncIterator]();

        return {
          async next(): Promise<IteratorResult<T>> {
            try {
              return await iterator.next();
            } catch (error) {
              if (isRateLimitError(error)) {
                if (retryCount < MAX_RATE_LIMIT_RETRIES) {
                  const waitTime = RATE_LIMIT_RETRY_DELAY_MS;
                  log(
                    `Rate limit hit during stream. Waiting ${waitTime / 1000} seconds before retry ${retryCount + 1}/${MAX_RATE_LIMIT_RETRIES}...`,
                  );
                  useFraudeStore.setState({
                    statusText: `Rate limited - waiting ${waitTime / 1000}s (retry ${retryCount + 1}/${MAX_RATE_LIMIT_RETRIES})`,
                  });
                  await sleep(waitTime);

                  // Create a new stream and continue from there
                  const newStreamResponse = self.stream(input, options);
                  const newIterator = self
                    .createRetryableStream<T>(
                      newStreamResponse.stream as AsyncIterable<T>,
                      input,
                      options,
                      retryCount + 1,
                    )
                    [Symbol.asyncIterator]();

                  return newIterator.next();
                } else {
                  // Exhausted retries, offer model selection
                  const errorMessage =
                    error instanceof Error ? error.message : String(error);
                  log(
                    `Rate limit retries exhausted during stream. Prompting user for model selection...`,
                  );

                  const selectedModel = await useFraudeStore
                    .getState()
                    .requestModelSelection(self.config.model, errorMessage);

                  if (selectedModel) {
                    log(`User selected alternative model: ${selectedModel}`);
                    self.setModel(selectedModel);
                    // Create a new stream with the new model, reset retry count
                    const newStreamResponse = self.stream(input, options);
                    const newIterator = self
                      .createRetryableStream<T>(
                        newStreamResponse.stream as AsyncIterable<T>,
                        input,
                        options,
                        0, // Reset retry count for new model
                      )
                      [Symbol.asyncIterator]();

                    return newIterator.next();
                  } else {
                    throw new Error(
                      `Request cancelled by user after rate limit on model: ${self.config.model}`,
                    );
                  }
                }
              }
              throw error;
            }
          },
        };
      },
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
    input: string,
    schema: StructuredSchema<T>,
    options?: Partial<AgentConfig> & {
      schemaName?: string;
      schemaDescription?: string;
    },
  ): Promise<StructuredAgentResponse<T>> {
    const contextManager = useFraudeStore.getState().contextManager;
    const messages = contextManager.addContext(input);
    const mergedConfig = { ...this.config, ...options };

    const result = await withRateLimitRetry(
      async () => {
        return await generateText({
          model: this.model as Parameters<typeof generateText>[0]["model"],
          messages,
          system: mergedConfig.systemPrompt,
          temperature: mergedConfig.temperature,
          maxOutputTokens: mergedConfig.maxTokens,
          providerOptions: buildProviderOptions(mergedConfig),
          output: Output.object({
            schema,
            name: options?.schemaName,
            description: options?.schemaDescription,
          }),
        });
      },
      this.config.model,
      (newModelName) => {
        this.setModel(newModelName);
        return async () => {
          return await generateText({
            model: this.model as Parameters<typeof generateText>[0]["model"],
            messages,
            system: mergedConfig.systemPrompt,
            temperature: mergedConfig.temperature,
            maxOutputTokens: mergedConfig.maxTokens,
            providerOptions: buildProviderOptions(mergedConfig),
            output: Output.object({
              schema,
              name: options?.schemaName,
              description: options?.schemaDescription,
            }),
          });
        };
      },
    );

    return {
      object: result.output as T,
      usage: extractUsage(result.usage),
      finishReason: result.finishReason ?? "unknown",
      raw: result,
    };
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

  getModel(): string {
    return this.config.model;
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

  private mapResponse(
    result: Awaited<ReturnType<typeof generateText>>,
  ): AgentResponse {
    const steps: StepInfo[] =
      result.steps?.map((step, index) =>
        this.mapStepInfo({ ...step, stepNumber: index + 1 }),
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

    log(`Step ${step.stepNumber}: ${JSON.stringify(step, null, 2)}`);

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
    messages: ModelMessage[],
  ): Promise<AgentResponse> {
    const contextManager = useFraudeStore.getState().contextManager;
    // Wait for the stream to complete
    const finalResult = await result;

    // Update conversation history
    const responseMessages = await result.response;
    contextManager.addContext(responseMessages.messages);

    const text = await result.text;
    const usage = await result.usage;
    const finishReason = await result.finishReason;
    const steps = await result.steps;

    const mappedSteps: StepInfo[] =
      steps?.map((step, index) =>
        this.mapStepInfo({ ...step, stepNumber: index + 1 }),
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
