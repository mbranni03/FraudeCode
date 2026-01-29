import { spawn } from "bun";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  wasm?: string;
  runOutput?: {
    stdout: string;
    stderr: string;
  };
}

type SupportedLanguage = "rust" | "javascript" | "typescript" | "python";

export class Compiler {
  private tempDir: string;
  private language: SupportedLanguage;
  private tool: string;
  private args: string[];
  private timeout: number;

  constructor(
    language: string,
    private code: string,
    private options: {
      tool?: string;
      args?: string[];
      timeout?: number;
    } = {},
  ) {
    this.tempDir = join(tmpdir(), `compile-${crypto.randomUUID()}`);
    this.language = language.toLowerCase() as SupportedLanguage;
    this.tool = options.tool || "";
    this.args = options.args || [];
    this.timeout = options.timeout || 10000;
  }

  async execute(): Promise<ExecutionResult> {
    switch (this.language) {
      case "javascript":
      case "typescript":
        return this.executeJsTs();
      case "python":
        return this.executePython();
      case "rust":
        return this.executeRust();
      default:
        return {
          stdout: "",
          stderr: `Unsupported language: ${this.language}`,
          exitCode: 1,
        };
    }
  }

  /**
   * Execute JavaScript/TypeScript using 'bun run' in a separate process.
   * This ensures isolation and reliable timeout handling.
   */
  private async executeJsTs(): Promise<ExecutionResult> {
    try {
      await mkdir(this.tempDir, { recursive: true });

      // Bun handles both .js and .ts natively
      const extension = this.language === "javascript" ? "js" : "ts";
      const filename = `main.${extension}`;
      const filePath = join(this.tempDir, filename);
      await writeFile(filePath, this.code);

      // Spawn 'bun run'
      const proc = spawn(["bun", "run", filename], {
        cwd: this.tempDir,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, FORCE_COLOR: "0" }, // Disable color codes
      });

      return await this.handleProcessWithTimeout(proc);
    } finally {
      await rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Execute Python using Pyodide in a SEPARATE process.
   * Running Pyodide in the main thread (even async) can block the event loop
   * if the user code has Infinite Loops. Spawning guarantees we can kill it.
   */
  private async executePython(): Promise<ExecutionResult> {
    try {
      await mkdir(this.tempDir, { recursive: true });

      const runnerPath = join(this.tempDir, "py_runner.ts");

      // We create a runner script that loads Pyodide and executes the code
      // This script runs in a separate Bun process
      const runnerCode = `
import { loadPyodide } from "pyodide";

async function main() {
  try {
    const pyodide = await loadPyodide();
    
    // Capture stdout/stderr using StringIO
    pyodide.runPython(\`
import sys
import traceback
from io import StringIO
__stdout = StringIO()
__stderr = StringIO()
sys.stdout = __stdout
sys.stderr = __stderr
    \`);

    // We wrap the user code in a try/except block to ensure we capture tracebacks
    // into our redirected stderr.
    // Note: This approach works for scripts. Top-level await is supported by runPythonAsync
    // but wrapping it effectively requires care. For now, we execute the code directly
    // and rely on pyodide's behavior, but if it fails, we try to recover the traceback.
    
    // Actually, a better approach for robustness: enable traceback manipulation
    const code = ${JSON.stringify(this.code)};
    
    let exitCode = 0;
    try {
        await pyodide.runPythonAsync(code);
    } catch (err) {
        // If an error occurs, print it to the captured stderr
        pyodide.runPython("traceback.print_exc()");
        exitCode = 1;
    }

    const stdout = pyodide.runPython("__stdout.getvalue()");
    const stderr = pyodide.runPython("__stderr.getvalue()");

    process.stdout.write(stdout);
    process.stderr.write(stderr);
    
    process.exit(exitCode);
  } catch (e: any) {
    // System error (loading pyodide, etc)
    console.error(e.message || String(e));
    process.exit(1);
  }
}

main();
`;
      await writeFile(runnerPath, runnerCode);

      const proc = spawn(["bun", "run", runnerPath], {
        cwd: this.tempDir,
        stdout: "pipe",
        stderr: "pipe",
      });

      return await this.handleProcessWithTimeout(proc);
    } finally {
      await rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async executeRust(): Promise<ExecutionResult> {
    try {
      await mkdir(this.tempDir, { recursive: true });
      await mkdir(join(this.tempDir, "src"), { recursive: true });

      const cargoToml = `
[package]
name = "compile-project"
version = "0.1.0"
edition = "2021"

[dependencies]
`;
      await writeFile(join(this.tempDir, "Cargo.toml"), cargoToml);
      await writeFile(join(this.tempDir, "src", "main.rs"), this.code);

      const tool = this.tool || "cargo";
      const proc = spawn([tool, ...this.args], {
        cwd: this.tempDir,
        stderr: "pipe",
        stdout: "pipe",
      });

      const buildResult = await new Response(proc.stdout).text();
      const buildError = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return {
          stdout: buildResult,
          stderr: buildError,
          exitCode,
        };
      }

      // Check for WASM output
      let wasmPath: string | undefined;
      let wasmBase64: string | undefined;

      if (this.args.some((arg) => arg.includes("wasm32"))) {
        const possiblePaths = [
          join(
            this.tempDir,
            "target",
            "wasm32-wasi",
            "debug",
            "compile_project.wasm",
          ),
          join(
            this.tempDir,
            "target",
            "wasm32-wasip1",
            "debug",
            "compile_project.wasm",
          ),
          join(
            this.tempDir,
            "target",
            "wasm32-wasi",
            "debug",
            "compile-project.wasm",
          ),
          join(
            this.tempDir,
            "target",
            "wasm32-wasip1",
            "debug",
            "compile-project.wasm",
          ),
          join(this.tempDir, "main.wasm"),
        ];

        for (const p of possiblePaths) {
          if (await Bun.file(p).exists()) {
            const buffer = await readFile(p);
            wasmBase64 = buffer.toString("base64");
            wasmPath = p;
            break;
          }
        }
      }

      let runOutput;
      if (wasmPath) {
        runOutput = await this.runWasm(wasmPath);
      }

      return {
        stdout: buildResult,
        stderr: buildError,
        exitCode,
        wasm: wasmBase64,
        runOutput,
      };
    } finally {
      await rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async runWasm(
    wasmPath: string,
  ): Promise<{ stdout: string; stderr: string }> {
    const runnerPath = join(this.tempDir, "runner.ts");

    const runnerCode = `
import { readFile } from "node:fs/promises";
import { WASI } from "node:wasi";

async function main() {
  const wasmPath = process.argv[2];
  if (!wasmPath) throw new Error("No WASM path provided");

  const wasi = new WASI({
    version: "preview1",
    args: ["main.wasm"],
    env: {},
  });

  const wasm = await readFile(wasmPath);
  const module = await WebAssembly.compile(wasm);
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });

  wasi.start(instance);
}

main().catch(console.error);
`;
    await writeFile(runnerPath, runnerCode);

    const proc = spawn(["bun", "run", runnerPath, wasmPath], {
      cwd: this.tempDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    return { stdout, stderr };
  }

  /**
   * Generic helper to wait for a spawned process with a timeout.
   * Kills the process if it exceeds the timeout.
   */
  private async handleProcessWithTimeout(proc: any): Promise<ExecutionResult> {
    let timer: Timer | null = null;
    let timedOut = false;

    const timeoutPromise = new Promise<ExecutionResult>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        proc.kill(); // Kill the process
        resolve({
          stdout: "",
          stderr: `Execution timeout after ${this.timeout}ms`,
          exitCode: 124,
        });
      }, this.timeout);
    });

    const executionPromise = (async () => {
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      if (timer) clearTimeout(timer);

      if (timedOut) {
        // Already handled by timeoutPromise
        return { stdout: "", stderr: "", exitCode: 124 };
      }

      return {
        stdout,
        stderr,
        exitCode,
      };
    })();

    return Promise.race([executionPromise, timeoutPromise]);
  }
}
