import { Glob } from "bun";
import { readdir } from "node:fs/promises";
import path from "node:path";

// Cache for file list to avoid re-scanning on every keystroke
let fileCache: string[] | null = null;
let lastScanTime = 0;
const SCAN_INTERVAL = 10000; // 10 seconds

export async function getFileSuggestions(cwd: string): Promise<string[]> {
  const now = Date.now();
  if (fileCache && now - lastScanTime < SCAN_INTERVAL) {
    return fileCache;
  }

  try {
    // Attempt to use Bun.Glob for efficient scanning
    const glob = new Glob("**/*");
    const files: string[] = [];

    // Scan recursively
    for await (const file of glob.scan({ cwd, dot: false, onlyFiles: false })) {
      // Exclude specific directories by checking path segments to avoid false positives (e.g. "distribution" containing "dist")
      const parts = file.split(path.sep);
      if (
        parts.some(
          (p) =>
            p === "node_modules" ||
            p === ".git" ||
            p === ".next" ||
            p === "dist" ||
            p === ".bun" ||
            p === "coverage" ||
            p === "build",
        )
      ) {
        continue;
      }
      files.push(file);
      // Limit to prevent performance issues in huge repos
      if (files.length >= 2000) break;
    }

    fileCache = files;
    lastScanTime = now;
    return files;
  } catch (error) {
    // Fallback or error handling
    console.error("Error scanning files with Bun.Glob:", error);
    return [];
  }
}

export function filterFiles(files: string[], input: string): string[] {
  if (!input) return [];

  // Input might be "@src/u" -> we want to match "src/utils"
  const query = input.startsWith("@") ? input.slice(1) : input;
  const lowerQuery = query.toLowerCase();

  return files.filter((f) => f.toLowerCase().includes(lowerQuery));
}
