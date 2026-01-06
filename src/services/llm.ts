import { ChatOllama } from "@langchain/ollama";
import z from "zod";
import { useSettingsStore } from "../store/settingsStore";

// Helper to get state non-reactively (outside components)
const getSettings = () => useSettingsStore.getState();

export const getThinkerModel = () => {
  const { thinkerModel, ollamaUrl } = getSettings();
  return new ChatOllama({
    model: thinkerModel,
    baseUrl: ollamaUrl,
    temperature: 0,
  });
};

export const getGeneralModel = () => {
  const { generalModel, ollamaUrl } = getSettings();
  return new ChatOllama({
    model: generalModel,
    baseUrl: ollamaUrl,
    temperature: 0,
  });
};

export const getScoutModel = () => {
  const { scoutModel, ollamaUrl } = getSettings();
  return new ChatOllama({
    model: scoutModel,
    baseUrl: ollamaUrl,
    temperature: 0,
  });
};

export const isOllamaHealthy = async (): Promise<boolean> => {
  try {
    const { ollamaUrl } = getSettings();
    const response = await fetch(ollamaUrl);
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
    families: z.array(z.string()).optional(), // Made optional as sometimes it's missing or null
    parameter_size: z.string(),
    quantization_level: z.string(),
  }),
});

export type OllamaModel = z.infer<typeof OllamaModelSchema>;

export const getOllamaModels = async (): Promise<OllamaModel[]> => {
  const { ollamaUrl } = getSettings();
  const response = await fetch(`${ollamaUrl}/api/tags`);
  if (!response.ok) {
    throw new Error(`Error connecting to Ollama: ${response.status}`);
  }
  const data: any = await response.json();
  // Safe parsing
  return OllamaModelSchema.array().parse(data.models);
};
