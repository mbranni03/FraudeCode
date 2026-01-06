import { ChatOllama } from "@langchain/ollama";
import z from "zod";

export const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
export const THINKER_MODEL = process.env.THINKER_MODEL || "qwen3:8b";
export const GENERAL_MODEL = process.env.GENERAL_MODEL || "llama3.1:latest";
export const SCOUT_MODEL = process.env.SCOUT_MODEL || "qwen2.5:0.5b";

export const thinkerModel = new ChatOllama({
  model: THINKER_MODEL,
  baseUrl: OLLAMA_URL,
  temperature: 0,
});

export const generalModel = new ChatOllama({
  model: GENERAL_MODEL,
  baseUrl: OLLAMA_URL,
  temperature: 0,
});

export const scoutModel = new ChatOllama({
  model: SCOUT_MODEL,
  baseUrl: OLLAMA_URL,
  temperature: 0,
});

export const isOllamaHealthy = async (): Promise<boolean> => {
  try {
    const response = await fetch(OLLAMA_URL);
    const text = await response.text();
    return response.ok && text === "Ollama is running";
  } catch {
    return false;
  }
};

const OllamaModelSchema = z.object({
  name: z.string(),
  modified_at: z.string(),
  size: z.number(),
  digest: z.string(),
  details: z.object({
    format: z.string(),
    family: z.string(),
    families: z.array(z.string()),
    parameter_size: z.string(),
    quantization_level: z.string(),
  }),
});

export type OllamaModel = z.infer<typeof OllamaModelSchema>;

export const getOllamaModels = async (): Promise<OllamaModel[]> => {
  const response = await fetch(`${OLLAMA_URL}/api/tags`);
  if (!response.ok) {
    throw new Error(`Error connecting to Ollama: ${response.status}`);
  }
  const data: any = await response.json();
  return OllamaModelSchema.array().parse(data.models);
};

export const OLLAMA_BASE_URL = OLLAMA_URL;
