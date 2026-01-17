import { tool } from "ai";
import { z } from "zod";
import useFraudeStore from "@/store/useFraudeStore";
import DESCRIPTION from "./descriptions/grep.txt";

const { updateOutput } = useFraudeStore.getState();

const grepTool = tool({
  description: DESCRIPTION,
  inputSchema: z.object({
    pattern: z
      .string()
      .describe("The regex pattern to search for in file contents"),
    path: z
      .string()
      .optional()
      .describe(
        "The directory to search in. Defaults to the current working directory."
      ),
    include: z
      .string()
      .optional()
      .describe(
        'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")'
      ),
  }),
  execute: async ({
    pattern,
    path,
    include,
  }: {
    pattern: string;
    path?: string;
    include?: string;
  }) => {
    const cwd = path || process.cwd();

    // Step 1: Attempt Git Grep (Fastest + Respects .gitignore)
    const gitResult = await runGitGrep(pattern, cwd, include);
    if (gitResult) return formatOutput(gitResult);

    // Step 2: Attempt System Grep (Fast, Standard)
    const sysResult = await runSystemGrep(pattern, cwd, include);
    if (sysResult) return formatOutput(sysResult);

    // Step 3: Fallback to Bun Native (Portable, checks .gitignore manually)
    const bunResult = await runBunGrep(pattern, cwd, include);
    return formatOutput(bunResult);
  },
});

// --- Internal Types ---
type MatchResult = {
  file: string;
  line?: number;
  content: string;
  mtime: number;
};

// --- Strategy 1: Git Grep ---
async function runGitGrep(
  pattern: string,
  cwd: string,
  include?: string
): Promise<MatchResult[] | null> {
  // Check if we are in a git repo first to avoid noisy errors
  const isGit =
    (await Bun.spawn(["git", "rev-parse", "--is-inside-work-tree"], { cwd })
      .exited) === 0;
  if (!isGit) return null;

  try {
    // -I: Ignore binary, -n: Line numbers, --full-name: path relative to root
    const args = ["git", "grep", "-I", "-n", "--full-name", pattern];

    // Add include pattern if specified (git grep uses -- 'pattern' syntax)
    if (include) {
      args.push("--", include);
    }

    const proc = Bun.spawn(args, { cwd, stderr: "pipe" });
    const text = await new Response(proc.stdout).text();

    if ((await proc.exited) !== 0 && !text) return null; // No matches or error
    return await parseAndStat(text, cwd);
  } catch (e) {
    return null;
  }
}

// --- Strategy 2: System Grep ---
async function runSystemGrep(
  pattern: string,
  cwd: string,
  include?: string
): Promise<MatchResult[] | null> {
  try {
    // -r: Recursive, -I: Ignore binary, -n: Line numbers
    const args = ["grep", "-rIn"];

    // Add include pattern if specified
    if (include) {
      args.push(`--include=${include}`);
    }

    args.push(pattern, ".");

    const proc = Bun.spawn(args, {
      cwd,
      stderr: "pipe",
    });
    const text = await new Response(proc.stdout).text();

    // Grep returns exit code 1 if no matches found (valid case)
    if ((await proc.exited) === 1 && !text) return [];
    if ((await proc.exited) !== 0) return null; // Real error

    return await parseAndStat(text, cwd);
  } catch (e) {
    return null;
  }
}

// --- Strategy 3: Bun Native (Fallback) ---
async function runBunGrep(
  pattern: string,
  cwd: string,
  include?: string
): Promise<MatchResult[]> {
  const { Glob } = await import("bun");
  // Use include pattern if specified, otherwise match all files
  const globPattern = include ? `**/${include}` : "**/*";
  const glob = new Glob(globPattern);
  const matches: MatchResult[] = [];

  // Create a regex from the pattern
  const regex = new RegExp(pattern);

  // Simple ignore list (Simulating .gitignore)
  // In a real app, you might parse .gitignore lines here
  const IGNORE = ["node_modules", ".git", "dist", "build", ".lock"];

  for await (const file of glob.scan({ cwd })) {
    // 1. Manual Ignore Filter
    if (IGNORE.some((ignore) => file.includes(ignore))) continue;

    // 2. Read & Search
    const f = Bun.file(`${cwd}/${file}`);

    // Safety: Skip large files or binaries if possible (basic heuristic)
    if (f.size > 1024 * 1024) continue;

    const content = await f.text().catch(() => ""); // Handle read errors silently
    if (!content) continue;

    if (regex.test(content)) {
      // 3. Get Stats
      const mtime = await f.lastModified;

      // 4. Extract Lines (Simulate grep output)
      const lines = content.split("\n");
      lines.forEach((lineContent, idx) => {
        if (regex.test(lineContent)) {
          matches.push({
            file,
            line: idx + 1,
            content: lineContent.trim(),
            mtime,
          });
        }
      });
    }
  }

  // Native matches need sorting too
  return matches.sort((a, b) => b.mtime - a.mtime);
}

// --- Helper: Parse Grep Output & Attach Stats ---
async function parseAndStat(
  rawOutput: string,
  cwd: string
): Promise<MatchResult[]> {
  const lines = rawOutput.trim().split("\n");
  if (!lines.length || (lines.length === 1 && !lines[0])) return [];

  // 1. Parse lines into objects
  const parsed = lines
    .map((line) => {
      // Grep format: file:line:content
      // We limit split to 3 parts to handle colons in the content
      const parts = line.split(":");
      if (parts.length < 3) return null;

      return {
        file: parts[0],
        line: parseInt(parts[1]!, 10),
        content: parts.slice(2).join(":").trim(),
      };
    })
    .filter(Boolean) as Omit<MatchResult, "mtime">[];

  // 2. Get unique files to stat (performance optimization)
  const uniqueFiles = [...new Set(parsed.map((p) => p.file))];

  // 3. Fetch mtimes in parallel
  const mtimeMap = new Map<string, number>();
  await Promise.all(
    uniqueFiles.map(async (f) => {
      const stats = await Bun.file(`${cwd}/${f}`).lastModified;
      mtimeMap.set(f, stats);
    })
  );

  // 4. Attach mtime and Sort (Newest First)
  return parsed
    .map((p) => ({ ...p, mtime: mtimeMap.get(p.file) || 0 }))
    .sort((a, b) => b.mtime - a.mtime);
}

// --- Helper: Format for LLM ---
function formatOutput(results: MatchResult[]): string {
  if (results.length === 0) return "No matches found.";

  const truncated = results.length > 200;
  const displayResults = truncated ? results.slice(0, 200) : results;

  let output = displayResults
    .map(
      (r) =>
        `[${new Date(r.mtime).toISOString()}] ${r.file}:${r.line}  ${r.content}`
    )
    .join("\n");

  if (truncated) {
    output += `\n... (${results.length - 200} more matches truncated)`;
  }

  return output;
}

export default grepTool;
