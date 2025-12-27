import type { Chunk } from "../types/analysis";

const MAX_TOKENS = 8192;

export async function split(src: string, startLine: number): Promise<Chunk[]> {
  if (!src.trim()) return [];
  const lines = src.split("\n");
  const NEW_LINE_TOKEN = "\n";
  let currentLines: string[] = [];
  let currentTokens = 0;
  let splitStart = startLine;
  const splits: Chunk[] = [];

  const flush = () => {
    splits.push({
      id: crypto.randomUUID(),
      document: currentLines.join("\n"),
      startLine: splitStart,
      endLine: splitStart + currentLines.length,
    });
  };

  for (const line of lines) {
    const lineTokens = line.length + NEW_LINE_TOKEN.length;
    if (currentTokens + lineTokens > MAX_TOKENS && currentLines.length > 0) {
      flush();
      splitStart += currentLines.length;
      currentLines = [];
      currentTokens = 0;
    }
    currentLines.push(line);
    currentTokens += lineTokens;
  }
  if (currentLines.length > 0) flush();
  return splits;
}
