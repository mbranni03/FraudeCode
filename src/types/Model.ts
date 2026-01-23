import { z } from "zod";

const ProviderTypes = [
  "groq",
  "openrouter",
  "ollama",
  "mistral",
  "cerebras",
] as const;
export type ProviderType = (typeof ProviderTypes)[number];

export const ModelSchema = z.object({
  type: z.enum(ProviderTypes).default("ollama"),
  name: z.string(),
  modified_at: z.string(),
  size: z.number().optional(),
  digest: z.string(),
  capabilities: z.array(z.string()).optional(),
  usage: z
    .object({
      promptTokens: z.number().default(0),
      completionTokens: z.number().default(0),
      totalTokens: z.number().default(0),
    })
    .default({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }),
  details: z.object({
    format: z.string().optional(),
    family: z.string().optional(),
    families: z.array(z.string()).optional(),
    parameter_size: z.string().optional(),
    quantization_level: z.string().optional(),
    context_length: z.number().optional(),
  }),
});

export type Model = z.infer<typeof ModelSchema>;

/**
 * Creates a display identifier for a model that includes the provider
 * Format: "modelName (provider)"
 * Example: "openai/gpt-oss-120b (openrouter)"
 */
export function getModelDisplayId(model: Model): string {
  return `${model.name} (${model.type})`;
}

/**
 * Creates a display identifier from name and type
 */
export function createModelDisplayId(name: string, type: ProviderType): string {
  return `${name} (${type})`;
}

/**
 * Parses a display identifier back to name and type
 * Returns null if the format is invalid
 */
export function parseModelDisplayId(
  displayId: string,
): { name: string; type: ProviderType } | null {
  // Match pattern: "name (provider)"
  const match = displayId.match(/^(.+)\s+\((\w+)\)$/);
  if (!match || !match[1] || !match[2]) {
    return null;
  }

  const name = match[1];
  const type = match[2] as ProviderType;

  // Validate the provider type
  if (!["groq", "openrouter", "ollama"].includes(type)) {
    return null;
  }

  return { name, type };
}

/**
 * Generates a unique ID for storing model references
 * Format: "name|type"
 */
export function getModelUniqueId(model: Model): string {
  return `${model.name}|${model.type}`;
}

/**
 * Parses a unique ID back to name and type
 */
export function parseModelUniqueId(
  uniqueId: string,
): { name: string; type: ProviderType } | null {
  const parts = uniqueId.split("|");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  const [name, type] = parts;
  if (!["groq", "openrouter", "ollama"].includes(type)) {
    return null;
  }

  return { name, type: type as ProviderType };
}
