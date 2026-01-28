import { spawn } from "bun";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
// @ts-ignore
import { WASI } from "node:wasi";

export class Compiler {
  private tempDir: string;

  constructor(
    private tool: string,
    private args: string[],
    private language: string,
    private code: string,
  ) {
    this.tempDir = join(tmpdir(), `compile-${crypto.randomUUID()}`);
  }

  async execute(): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    wasm?: string;
    runOutput?: {
      stdout: string;
      stderr: string;
    };
  }> {
    try {
      await mkdir(this.tempDir, { recursive: true });
      await mkdir(join(this.tempDir, "src"), { recursive: true });

      if (this.language.toLowerCase() === "rust") {
        const cargoToml = `
[package]
name = "compile-project"
version = "0.1.0"
edition = "2021"

[dependencies]
`;
        await writeFile(join(this.tempDir, "Cargo.toml"), cargoToml);
        await writeFile(join(this.tempDir, "src", "main.rs"), this.code);
      } else {
        await writeFile(
          join(this.tempDir, `main.${this.getFileExtension()}`),
          this.code,
        );
      }

      // Execute the command
      const proc = spawn([this.tool, ...this.args], {
        cwd: this.tempDir,
        stderr: "pipe",
        stdout: "pipe",
      });

      const stdoutText = await new Response(proc.stdout).text();
      const stderrText = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      let wasmPath: string | undefined;
      let wasmBase64: string | undefined;

      // If the target has wasm in it, try to find the wasm file
      if (exitCode === 0 && this.args.some((arg) => arg.includes("wasm32"))) {
        try {
          // Attempt to find wasm in common locations
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
            try {
              const buffer = await readFile(p);
              wasmBase64 = buffer.toString("base64");
              wasmPath = p;
              break;
            } catch {
              continue;
            }
          }
        } catch (e) {
          console.error("Failed to read wasm file:", e);
        }
      }

      let runOutput;
      if (wasmPath) {
        runOutput = await this.runWasm(wasmPath);
      }

      return {
        stdout: stdoutText,
        stderr: stderrText,
        exitCode,
        wasm: wasmBase64,
        runOutput,
      };
    } finally {
      await rm(this.tempDir, { recursive: true, force: true });
    }
  }

  private async runWasm(
    wasmPath: string,
  ): Promise<{ stdout: string; stderr: string }> {
    const runnerPath = join(this.tempDir, "runner.ts");

    // Create a runner script that handles the WASI execution
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
    // In child process, we let it write to standard stdout/stderr
    // which the parent will capture
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

    // Spawn the runner
    const proc = spawn(["bun", "run", runnerPath, wasmPath], {
      cwd: this.tempDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    return { stdout, stderr };
  }

  private getFileExtension(): string {
    switch (this.language.toLowerCase()) {
      case "rust":
        return "rs";
      case "javascript":
        return "js";
      case "typescript":
        return "ts";
      case "python":
        return "py";
      default:
        return "txt";
    }
  }
}
