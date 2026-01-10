import { z } from "zod";
import { ModelSchema } from "./models";

export const SettingsSchema = z.object({
  lifetimeTokenUsage: z.number().default(0),
  lastOpened: z.iso.datetime().optional(),
  ollamaUrl: z.string().default("http://localhost:11434"),
  thinkerModel: z.string().default("qwen3:8b"),
  generalModel: z.string().default("llama3.1:latest"),
  scoutModel: z.string().default("qwen2.5:0.5b"),
  models: z.array(ModelSchema).default([]),
  openrouter_api_key: z.string().optional(),
  groq_api_key: z.string().optional(),
});

export type FraudeSettings = z.infer<typeof SettingsSchema>;
