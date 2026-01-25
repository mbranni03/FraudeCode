import * as rpc from "vscode-jsonrpc/node";
import * as lsp from "vscode-languageserver-protocol";
import { spawn, type ChildProcess } from "child_process";
import path from "path";

/**
 * Language Server configurations
 * Maps file extensions to language server commands
 */
const LANGUAGE_SERVERS: Record<
  string,
  { command: string[]; languageId: string }
> = {
  // TypeScript/JavaScript - use local typescript from node_modules
  ts: {
    command: ["npx", "typescript-language-server", "--stdio"],
    languageId: "typescript",
  },
  tsx: {
    command: ["npx", "typescript-language-server", "--stdio"],
    languageId: "typescriptreact",
  },
  js: {
    command: ["npx", "typescript-language-server", "--stdio"],
    languageId: "javascript",
  },
  jsx: {
    command: ["npx", "typescript-language-server", "--stdio"],
    languageId: "javascriptreact",
  },

  // Python
  py: { command: ["pyright-langserver", "--stdio"], languageId: "python" },

  // Rust
  rs: { command: ["rust-analyzer"], languageId: "rust" },

  // Go
  go: { command: ["gopls"], languageId: "go" },

  // C/C++
  c: { command: ["clangd"], languageId: "c" },
  cpp: { command: ["clangd"], languageId: "cpp" },
  h: { command: ["clangd"], languageId: "c" },
  hpp: { command: ["clangd"], languageId: "cpp" },

  // JSON
  json: {
    command: ["npx", "vscode-json-languageserver", "--stdio"],
    languageId: "json",
  },

  // CSS/SCSS
  css: {
    command: ["npx", "vscode-css-languageserver", "--stdio"],
    languageId: "css",
  },
  scss: {
    command: ["npx", "vscode-css-languageserver", "--stdio"],
    languageId: "scss",
  },

  // HTML
  html: {
    command: ["npx", "vscode-html-languageserver", "--stdio"],
    languageId: "html",
  },
};

interface ServerInstance {
  connection: rpc.MessageConnection;
  proc: ChildProcess;
  documentVersions: Map<string, number>;
}

export class UniversalLSPClient {
  private servers: Map<string, ServerInstance> = new Map();
  private rootPath: string;
  private pendingDiagnostics: Map<string, lsp.Diagnostic[]> = new Map();

  constructor(rootPath: string = process.cwd()) {
    this.rootPath = rootPath;
  }

  /**
   * Get or create a language server for the given file extension
   */
  private async getServer(ext: string): Promise<ServerInstance | null> {
    const config = LANGUAGE_SERVERS[ext];
    if (!config) return null;

    // Use languageId as key to share servers for same language
    const serverKey = config.languageId;

    if (this.servers.has(serverKey)) {
      return this.servers.get(serverKey)!;
    }

    try {
      const proc = spawn(config.command[0]!, config.command.slice(1), {
        cwd: this.rootPath,
        shell: true,
        stdio: ["pipe", "pipe", "inherit"],
      });

      // Handle spawn errors immediately
      proc.on("error", (err) => {
        console.error(`Failed to spawn language server for ${ext}:`, err);
        this.servers.delete(serverKey);
      });

      // Check if process exits immediately (e.g. command not found)
      proc.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          console.error(`Language server for ${ext} exited with code ${code}`);
          this.servers.delete(serverKey);
        }
      });

      const connection = rpc.createMessageConnection(
        new rpc.StreamMessageReader(proc.stdout!),
        new rpc.StreamMessageWriter(proc.stdin!),
      );

      connection.listen();

      // Initialize the server with timeout
      try {
        const initPromise = connection.sendRequest("initialize", {
          processId: process.pid,
          rootUri: `file://${this.rootPath}`,
          capabilities: {
            textDocument: {
              publishDiagnostics: { relatedInformation: true },
              synchronization: { dynamicRegistration: true },
              completion: { completionItem: { snippetSupport: false } },
              hover: { contentFormat: ["markdown", "plaintext"] },
              definition: { linkSupport: true },
              references: {},
              implementation: { linkSupport: true },
              documentSymbol: {
                hierarchicalDocumentSymbolSupport: true,
              },
              callHierarchy: { dynamicRegistration: false },
            },
            workspace: {
              symbol: { dynamicRegistration: false },
            },
          },
          workspaceFolders: [{ name: "root", uri: `file://${this.rootPath}` }],
        });

        // timeout after 5 seconds
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error("LSP initialization timed out")),
            5000,
          );
        });

        await Promise.race([initPromise, timeoutPromise]);
      } catch (e: any) {
        console.error(
          `Failed to initialize language server for ${ext}:`,
          e.message,
        );
        proc.kill();
        this.servers.delete(serverKey);
        return null;
      }

      await connection.sendNotification("initialized", {});

      // Listen for diagnostics
      connection.onNotification(
        "textDocument/publishDiagnostics",
        (params: { uri: string; diagnostics: lsp.Diagnostic[] }) => {
          this.pendingDiagnostics.set(params.uri, params.diagnostics);
        },
      );

      const instance: ServerInstance = {
        connection,
        proc,
        documentVersions: new Map(),
      };

      this.servers.set(serverKey, instance);
      return instance;
    } catch (error) {
      console.error(`Failed to start language server for ${ext}:`, error);
      return null;
    }
  }

  private getExtension(filePath: string): string {
    return filePath.split(".").pop() || "";
  }

  private getLanguageId(filePath: string): string {
    const ext = this.getExtension(filePath);
    return LANGUAGE_SERVERS[ext]?.languageId || "plaintext";
  }

  private async openDocument(
    server: ServerInstance,
    filePath: string,
    content: string,
  ): Promise<string> {
    const uri = `file://${path.resolve(this.rootPath, filePath)}`;
    const version = (server.documentVersions.get(uri) || 0) + 1;
    server.documentVersions.set(uri, version);

    await server.connection.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: this.getLanguageId(filePath),
        version,
        text: content,
      },
    });

    return uri;
  }

  /**
   * Check if a language is supported
   */
  isSupported(filePath: string): boolean {
    return this.getExtension(filePath) in LANGUAGE_SERVERS;
  }

  /**
   * Get list of supported extensions
   */
  getSupportedExtensions(): string[] {
    return Object.keys(LANGUAGE_SERVERS);
  }

  /**
   * Analyze a file for errors and warnings
   */
  async getDiagnostics(
    filePath: string,
    content: string,
  ): Promise<{ errors: string[]; warnings: string[] }> {
    const ext = this.getExtension(filePath);
    const server = await this.getServer(ext);

    if (!server) {
      return { errors: [], warnings: [] };
    }

    const uri = await this.openDocument(server, filePath, content);

    // Wait for diagnostics with timeout
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const diagnostics = this.pendingDiagnostics.get(uri) || [];

    const errors: string[] = [];
    const warnings: string[] = [];

    for (const d of diagnostics) {
      const msg = `Line ${d.range.start.line + 1}: ${d.message}`;
      if (d.severity === 1) {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }

    return { errors, warnings };
  }

  /**
   * Find where a symbol is defined
   */
  async findDefinition(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<{ file: string; line: number; preview?: string } | null> {
    const ext = this.getExtension(filePath);
    const server = await this.getServer(ext);

    if (!server) return null;

    const uri = await this.openDocument(server, filePath, content);

    const result = await server.connection.sendRequest(
      "textDocument/definition",
      {
        textDocument: { uri },
        position: { line: line - 1, character: character - 1 },
      },
    );

    if (!result) return null;

    const location = Array.isArray(result) ? result[0] : result;
    if (!location) return null;

    const targetUri = (location as any).uri || (location as any).targetUri;
    const range = (location as any).range || (location as any).targetRange;

    if (!targetUri) return null;

    const targetFile = targetUri.replace("file://", "");
    const targetLine = range?.start?.line ? range.start.line + 1 : 1;

    // Try to get a preview of the definition
    let preview: string | undefined;
    try {
      const defContent = await Bun.file(targetFile).text();
      const lines = defContent.split("\n");
      preview = lines
        .slice(Math.max(0, targetLine - 1), targetLine + 2)
        .join("\n");
    } catch {}

    return { file: targetFile, line: targetLine, preview };
  }

  /**
   * Get documentation/type info for a symbol
   */
  async getSymbolInfo(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<string | null> {
    const ext = this.getExtension(filePath);
    const server = await this.getServer(ext);

    if (!server) return null;

    const uri = await this.openDocument(server, filePath, content);

    const result = (await server.connection.sendRequest("textDocument/hover", {
      textDocument: { uri },
      position: { line: line - 1, character: character - 1 },
    })) as {
      contents?: { value?: string; kind?: string } | string | Array<any>;
    } | null;

    if (!result || !result.contents) return null;

    // Parse various hover content formats
    if (typeof result.contents === "string") {
      return result.contents;
    }

    if (Array.isArray(result.contents)) {
      return result.contents
        .map((c) => (typeof c === "string" ? c : c.value || ""))
        .join("\n");
    }

    return result.contents.value || JSON.stringify(result.contents);
  }

  /**
   * Find all references to a symbol
   */
  async findReferences(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<Array<{ file: string; line: number }>> {
    const ext = this.getExtension(filePath);
    const server = await this.getServer(ext);

    if (!server) return [];

    const uri = await this.openDocument(server, filePath, content);

    // Give the server time to index the file for references
    await new Promise((resolve) => setTimeout(resolve, 500));

    const result = (await server.connection.sendRequest(
      "textDocument/references",
      {
        textDocument: { uri },
        position: { line: line - 1, character: character - 1 },
        context: { includeDeclaration: true },
      },
    )) as Array<{ uri: string; range: { start: { line: number } } }> | null;

    if (!result) return [];

    return result.map((ref) => ({
      file: ref.uri.replace("file://", ""),
      line: ref.range.start.line + 1,
    }));
  }

  /**
   * Find implementations of an interface or abstract method
   */
  async findImplementation(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<Array<{ file: string; line: number; preview?: string }>> {
    const ext = this.getExtension(filePath);
    const server = await this.getServer(ext);

    if (!server) return [];

    const uri = await this.openDocument(server, filePath, content);

    const result = await server.connection.sendRequest(
      "textDocument/implementation",
      {
        textDocument: { uri },
        position: { line: line - 1, character: character - 1 },
      },
    );

    if (!result) return [];

    const locations = Array.isArray(result) ? result : [result];
    const implementations: Array<{
      file: string;
      line: number;
      preview?: string;
    }> = [];

    for (const location of locations) {
      const targetUri = (location as any).uri || (location as any).targetUri;
      const range = (location as any).range || (location as any).targetRange;

      if (!targetUri) continue;

      const targetFile = targetUri.replace("file://", "");
      const targetLine = range?.start?.line ? range.start.line + 1 : 1;

      let preview: string | undefined;
      try {
        const defContent = await Bun.file(targetFile).text();
        const lines = defContent.split("\n");
        preview = lines
          .slice(Math.max(0, targetLine - 1), targetLine + 2)
          .join("\n");
      } catch {}

      implementations.push({ file: targetFile, line: targetLine, preview });
    }

    return implementations;
  }

  /**
   * Get all symbols (functions, classes, variables) in a document
   */
  async getDocumentSymbols(
    filePath: string,
    content: string,
  ): Promise<
    Array<{ name: string; kind: string; line: number; children?: any[] }>
  > {
    const ext = this.getExtension(filePath);
    const server = await this.getServer(ext);

    if (!server) return [];

    const uri = await this.openDocument(server, filePath, content);

    const result = (await server.connection.sendRequest(
      "textDocument/documentSymbol",
      { textDocument: { uri } },
    )) as Array<any> | null;

    if (!result) return [];

    const symbolKindMap: Record<number, string> = {
      1: "File",
      2: "Module",
      3: "Namespace",
      4: "Package",
      5: "Class",
      6: "Method",
      7: "Property",
      8: "Field",
      9: "Constructor",
      10: "Enum",
      11: "Interface",
      12: "Function",
      13: "Variable",
      14: "Constant",
      15: "String",
      16: "Number",
      17: "Boolean",
      18: "Array",
      19: "Object",
      20: "Key",
      21: "Null",
      22: "EnumMember",
      23: "Struct",
      24: "Event",
      25: "Operator",
      26: "TypeParameter",
    };

    const mapSymbol = (
      sym: any,
    ): { name: string; kind: string; line: number; children?: any[] } => {
      const range = sym.range || sym.location?.range;
      const line = range?.start?.line ? range.start.line + 1 : 1;
      const kind = symbolKindMap[sym.kind] || `Kind${sym.kind}`;
      const mapped: {
        name: string;
        kind: string;
        line: number;
        children?: any[];
      } = {
        name: sym.name,
        kind,
        line,
      };
      if (sym.children && Array.isArray(sym.children)) {
        mapped.children = sym.children.map(mapSymbol);
      }
      return mapped;
    };

    return result.map(mapSymbol);
  }

  /**
   * Search for symbols across the entire workspace
   */
  async searchWorkspaceSymbols(
    query: string,
    filePath: string, // Used to determine which language server to use
  ): Promise<
    Array<{ name: string; kind: string; file: string; line: number }>
  > {
    const ext = this.getExtension(filePath);
    const server = await this.getServer(ext);

    if (!server) return [];

    const result = (await server.connection.sendRequest("workspace/symbol", {
      query,
    })) as Array<any> | null;

    if (!result) return [];

    const symbolKindMap: Record<number, string> = {
      1: "File",
      2: "Module",
      3: "Namespace",
      4: "Package",
      5: "Class",
      6: "Method",
      7: "Property",
      8: "Field",
      9: "Constructor",
      10: "Enum",
      11: "Interface",
      12: "Function",
      13: "Variable",
      14: "Constant",
      15: "String",
      16: "Number",
      17: "Boolean",
      18: "Array",
      19: "Object",
      20: "Key",
      21: "Null",
      22: "EnumMember",
      23: "Struct",
      24: "Event",
      25: "Operator",
      26: "TypeParameter",
    };

    return result.map((sym) => {
      const location = sym.location;
      const file = location?.uri?.replace("file://", "") || "";
      const line = location?.range?.start?.line
        ? location.range.start.line + 1
        : 1;
      const kind = symbolKindMap[sym.kind] || `Kind${sym.kind}`;
      return { name: sym.name, kind, file, line };
    });
  }

  /**
   * Get call hierarchy item at a position
   */
  async prepareCallHierarchy(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<
    Array<{ name: string; kind: string; file: string; line: number }>
  > {
    const ext = this.getExtension(filePath);
    const server = await this.getServer(ext);

    if (!server) return [];

    const uri = await this.openDocument(server, filePath, content);

    const result = (await server.connection.sendRequest(
      "textDocument/prepareCallHierarchy",
      {
        textDocument: { uri },
        position: { line: line - 1, character: character - 1 },
      },
    )) as Array<any> | null;

    if (!result) return [];

    const symbolKindMap: Record<number, string> = {
      1: "File",
      2: "Module",
      3: "Namespace",
      4: "Package",
      5: "Class",
      6: "Method",
      7: "Property",
      8: "Field",
      9: "Constructor",
      10: "Enum",
      11: "Interface",
      12: "Function",
      13: "Variable",
      14: "Constant",
    };

    return result.map((item) => ({
      name: item.name,
      kind: symbolKindMap[item.kind] || `Kind${item.kind}`,
      file: item.uri?.replace("file://", "") || "",
      line: item.range?.start?.line ? item.range.start.line + 1 : 1,
    }));
  }

  /**
   * Find all functions/methods that call the function at a position
   */
  async getIncomingCalls(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<Array<{ name: string; file: string; line: number }>> {
    const ext = this.getExtension(filePath);
    const server = await this.getServer(ext);

    if (!server) return [];

    const uri = await this.openDocument(server, filePath, content);

    // First, prepare the call hierarchy
    const prepareResult = (await server.connection.sendRequest(
      "textDocument/prepareCallHierarchy",
      {
        textDocument: { uri },
        position: { line: line - 1, character: character - 1 },
      },
    )) as Array<any> | null;

    if (!prepareResult || prepareResult.length === 0) return [];

    const item = prepareResult[0];

    const result = (await server.connection.sendRequest(
      "callHierarchy/incomingCalls",
      { item },
    )) as Array<any> | null;

    if (!result) return [];

    return result.map((call) => ({
      name: call.from?.name || "unknown",
      file: call.from?.uri?.replace("file://", "") || "",
      line: call.from?.range?.start?.line ? call.from.range.start.line + 1 : 1,
    }));
  }

  /**
   * Find all functions/methods called by the function at a position
   */
  async getOutgoingCalls(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<Array<{ name: string; file: string; line: number }>> {
    const ext = this.getExtension(filePath);
    const server = await this.getServer(ext);

    if (!server) return [];

    const uri = await this.openDocument(server, filePath, content);

    // First, prepare the call hierarchy
    const prepareResult = (await server.connection.sendRequest(
      "textDocument/prepareCallHierarchy",
      {
        textDocument: { uri },
        position: { line: line - 1, character: character - 1 },
      },
    )) as Array<any> | null;

    if (!prepareResult || prepareResult.length === 0) return [];

    const item = prepareResult[0];

    const result = (await server.connection.sendRequest(
      "callHierarchy/outgoingCalls",
      { item },
    )) as Array<any> | null;

    if (!result) return [];

    return result.map((call) => ({
      name: call.to?.name || "unknown",
      file: call.to?.uri?.replace("file://", "") || "",
      line: call.to?.range?.start?.line ? call.to.range.start.line + 1 : 1,
    }));
  }

  /**
   * Shutdown all running servers
   */
  async shutdown(): Promise<void> {
    for (const [, server] of this.servers) {
      try {
        await server.connection.sendRequest("shutdown");
        await server.connection.sendNotification("exit");
        server.proc.kill();
      } catch {}
    }
    this.servers.clear();
  }
}

// Singleton instance
let clientInstance: UniversalLSPClient | null = null;

export function getLSPClient(rootPath?: string): UniversalLSPClient {
  if (!clientInstance) {
    clientInstance = new UniversalLSPClient(rootPath);
  }
  return clientInstance;
}

export function resetLSPClient(): void {
  if (clientInstance) {
    clientInstance.shutdown().catch(() => {});
    clientInstance = null;
  }
}

export default UniversalLSPClient;
