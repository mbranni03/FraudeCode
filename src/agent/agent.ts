import { generateText, streamText, stepCountIs, type ModelMessage } from "ai";
import { getModel } from "@/providers/providers";
import type {
  AgentConfig,
  AgentResponse,
  StreamingAgentResponse,
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
  private rawModel: string;

  constructor(config: AgentConfig) {
    this.config = {
      temperature: 0.7,
      maxTokens: 4096,
      maxSteps: 5,
      autoExecuteTools: true,
      ...config,
    };
    this.model = getModel(config.model);
    this.rawModel = config.model;
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

    const result = await generateText({
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
      async experimental_repairToolCall(failed) {
        const lower = failed.toolCall.toolName.toLowerCase();
        if (lower !== failed.toolCall.toolName && mergedConfig.tools?.[lower]) {
          return {
            ...failed.toolCall,
            toolName: lower,
          };
        }
        return {
          ...failed.toolCall,
          input: JSON.stringify({
            tool: failed.toolCall.toolName,
            error: failed.error.message,
          }),
          toolName: "invalid",
        };
      },
      onStepFinish: (step) => {
        if (mergedConfig.onStepComplete) {
          mergedConfig.onStepComplete(this.mapStepInfo(step));
        }
      },
    });

    // Update conversation history
    contextManager.addContext(result.response.messages);

    const response = this.mapResponse(result);
    await incrementModelUsage(this.rawModel, response.usage);
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
      async experimental_repairToolCall(failed) {
        const lower = failed.toolCall.toolName.toLowerCase();
        if (lower !== failed.toolCall.toolName && mergedConfig.tools?.[lower]) {
          return {
            ...failed.toolCall,
            toolName: lower,
          };
        }
        return {
          ...failed.toolCall,
          input: JSON.stringify({
            tool: failed.toolCall.toolName,
            error: failed.error.message,
          }),
          toolName: "invalid",
        };
      },
      onChunk: async ({ chunk }) => {
        if (mergedConfig.onStreamChunk) {
          await mergedConfig.onStreamChunk(chunk);
        }
      },
      onStepFinish: (step) => {
        if (mergedConfig.onStepComplete) {
          mergedConfig.onStepComplete(this.mapStepInfo(step));
        }
      },
    });

    return {
      response: this.buildStreamingResponse(result, messages),
    };
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  getModel(): string {
    return this.rawModel;
  }

  /**
   * Switch to a different model (used internally by rate limit retry logic)
   */
  setModel(modelName: string): void {
    this.config.model = modelName;
    this.model = getModel(modelName);
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
