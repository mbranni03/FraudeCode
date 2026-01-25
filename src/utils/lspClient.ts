import * as ts from "typescript";
import Parser = require("web-tree-sitter");
import path from "path";
import fs from "fs";

/**
 * Common interface for all language providers
 */
export interface LanguageProvider {
  isSupported(extension: string): boolean;
  getDiagnostics(
    filePath: string,
    content: string,
  ): Promise<{ errors: string[]; warnings: string[] }>;
  findDefinition(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<{ file: string; line: number; preview?: string } | null>;
  findReferences(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<Array<{ file: string; line: number }>>;
  getDocumentSymbols(
    filePath: string,
    content: string,
  ): Promise<
    Array<{ name: string; kind: string; line: number; children?: any[] }>
  >;

  // Added missing methods
  getSymbolInfo(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<string | null>;
  findImplementation(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<Array<{ file: string; line: number; preview?: string }>>;

  // Optional advanced features
  prepareCallHierarchy?(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<Array<{ name: string; kind: string; file: string; line: number }>>;
  getIncomingCalls?(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<Array<{ name: string; file: string; line: number }>>;
  getOutgoingCalls?(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ): Promise<Array<{ name: string; file: string; line: number }>>;
  searchWorkspaceSymbols?(
    query: string,
  ): Promise<Array<{ name: string; kind: string; file: string; line: number }>>;
}

/**
 * ----------------------------------------------------------------------
 * TIER 1: TypeScript Provider (High Fidelity)
 * Uses the TypeScript Compiler API to provide rich analysis for TS/JS files.
 * ----------------------------------------------------------------------
 */
class TypeScriptProvider implements LanguageProvider {
  private service: ts.LanguageService;
  private files: Map<string, { version: number; content: string }> = new Map();

  constructor(private rootPath: string) {
    const registry = ts.createDocumentRegistry();
    const serviceHost: ts.LanguageServiceHost = {
      getScriptFileNames: () => Array.from(this.files.keys()),
      getScriptVersion: (fileName) =>
        this.files.get(fileName)?.version.toString() || "0",
      getScriptSnapshot: (fileName) => {
        const file = this.files.get(fileName);
        if (file) {
          return ts.ScriptSnapshot.fromString(file.content);
        }
        if (fs.existsSync(fileName)) {
          return ts.ScriptSnapshot.fromString(
            fs.readFileSync(fileName, "utf-8"),
          );
        }
        return undefined;
      },
      getCurrentDirectory: () => this.rootPath,
      getCompilationSettings: () => ({
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
        allowJs: true,
        jsx: ts.JsxEmit.React,
        strict: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        esModuleInterop: true,
        skipLibCheck: true,
        resolveJsonModule: true,
      }),
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
    };

    this.service = ts.createLanguageService(serviceHost, registry);
  }

  isSupported(ext: string): boolean {
    return ["ts", "tsx", "js", "jsx"].includes(ext);
  }

  private updateFile(filePath: string, content: string) {
    const current = this.files.get(filePath);
    if (!current || current.content !== content) {
      this.files.set(filePath, {
        version: (current?.version || 0) + 1,
        content,
      });
    }
  }

  async getDiagnostics(filePath: string, content: string) {
    this.updateFile(filePath, content);

    const syntactic = this.service.getSyntacticDiagnostics(filePath);
    const semantic = this.service.getSemanticDiagnostics(filePath);

    const all = [...syntactic, ...semantic];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const d of all) {
      const line = d.file
        ? d.file.getLineAndCharacterOfPosition(d.start!).line + 1
        : 0;
      const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
      const fmt = `Line ${line}: ${msg}`;
      if (d.category === ts.DiagnosticCategory.Error) {
        errors.push(fmt);
      } else {
        warnings.push(fmt);
      }
    }

    return { errors, warnings };
  }

  async findDefinition(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    this.updateFile(filePath, content);
    const sourceFile = this.service.getProgram()?.getSourceFile(filePath);
    if (!sourceFile) return null;

    const pos = sourceFile.getPositionOfLineAndCharacter(
      line - 1,
      character - 1,
    );
    const defs = this.service.getDefinitionAtPosition(filePath, pos);

    if (!defs || defs.length === 0) return null;
    const def = defs[0];
    if (!def) return null;

    const defFile = def.fileName;
    const defStart = def.textSpan.start;

    let fileContent = "";
    if (this.files.has(defFile)) {
      fileContent = this.files.get(defFile)!.content;
    } else if (fs.existsSync(defFile)) {
      fileContent = fs.readFileSync(defFile, "utf-8");
    }

    if (!fileContent) return null;

    const tempSource = ts.createSourceFile(
      defFile,
      fileContent,
      ts.ScriptTarget.Latest,
    );
    const linePos = tempSource.getLineAndCharacterOfPosition(defStart);

    const lines = fileContent.split("\n");
    const preview = lines
      .slice(Math.max(0, linePos.line - 1), linePos.line + 2)
      .join("\n");

    return {
      file: defFile,
      line: linePos.line + 1,
      preview,
    };
  }

  async getSymbolInfo(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    this.updateFile(filePath, content);
    const sourceFile = this.service.getProgram()?.getSourceFile(filePath);
    if (!sourceFile) return null;

    const pos = sourceFile.getPositionOfLineAndCharacter(
      line - 1,
      character - 1,
    );
    const info = this.service.getQuickInfoAtPosition(filePath, pos);

    if (!info) return null;

    const displayParts = ts.displayPartsToString(info.displayParts);
    const doc = ts.displayPartsToString(info.documentation);

    return `${displayParts}\n${doc}`;
  }

  async findImplementation(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    this.updateFile(filePath, content);
    const sourceFile = this.service.getProgram()?.getSourceFile(filePath);
    if (!sourceFile) return [];

    const pos = sourceFile.getPositionOfLineAndCharacter(
      line - 1,
      character - 1,
    );
    const impls = this.service.getImplementationAtPosition(filePath, pos);

    if (!impls) return [];

    return impls.map((impl) => {
      const implSource = this.service
        .getProgram()
        ?.getSourceFile(impl.fileName);
      const line = implSource
        ? implSource.getLineAndCharacterOfPosition(impl.textSpan.start).line + 1
        : 1;
      return { file: impl.fileName, line };
    });
  }

  async findReferences(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    this.updateFile(filePath, content);
    const sourceFile = this.service.getProgram()?.getSourceFile(filePath);
    if (!sourceFile) return [];

    const pos = sourceFile.getPositionOfLineAndCharacter(
      line - 1,
      character - 1,
    );
    const refs = this.service.getReferencesAtPosition(filePath, pos);

    if (!refs) return [];

    return refs.map((ref) => {
      const refSource = this.service.getProgram()?.getSourceFile(ref.fileName);
      const line = refSource
        ? refSource.getLineAndCharacterOfPosition(ref.textSpan.start).line + 1
        : 1;
      return { file: ref.fileName, line };
    });
  }

  async getDocumentSymbols(filePath: string, content: string) {
    this.updateFile(filePath, content);
    const navTree = this.service.getNavigationTree(filePath);

    const convert = (node: ts.NavigationTree): any => {
      const sourceFile = this.service.getProgram()?.getSourceFile(filePath);
      const line =
        sourceFile && node.spans && node.spans[0]
          ? sourceFile.getLineAndCharacterOfPosition(node.spans[0].start).line +
            1
          : 1;

      return {
        name: node.text,
        kind: node.kind,
        line,
        children: node.childItems?.map(convert),
      };
    };

    return navTree.childItems?.map(convert) || [];
  }
}

/**
 * ----------------------------------------------------------------------
 * TIER 2: Tree-Sitter Provider (Structure & Symbols)
 * ----------------------------------------------------------------------
 */
class TreeSitterProvider implements LanguageProvider {
  private parser: any = null;
  private lang: any = null;
  private isReady = false;

  constructor(
    private languageName: string,
    private wasmPath: string,
  ) {
    this.init();
  }

  private async init() {
    try {
      if (!fs.existsSync(this.wasmPath)) return;
      await (Parser as any).init();
      this.lang = await (Parser as any).Language.load(this.wasmPath);
      this.parser = new (Parser as any)();
      this.parser.setLanguage(this.lang);
      this.isReady = true;
    } catch (e) {
      // Fail silently, fallback will take over
    }
  }

  isSupported(ext: string): boolean {
    return this.isReady;
  }

  async getDiagnostics() {
    return { errors: [], warnings: [] };
  }

  async findDefinition(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    if (!this.parser || !this.lang) return null;
    const tree = this.parser.parse(content);

    // Simple heuristic: search for definition of symbol at cursor
    // Need exact logic for determining symbol at cursor for TS (row/col)
    // Assume we can get the text
    const lines = content.split("\n");
    const docLine = lines[line - 1] || "";
    // Crude extraction of word
    const match = docLine.slice(0, character).match(/[a-zA-Z0-9_]+$/);
    const suffix = docLine.slice(character).match(/^[a-zA-Z0-9_]+/);
    const word = (match ? match[0] : "") + (suffix ? suffix[0] : "");
    if (!word) return null;

    const symbols = await this.getDocumentSymbols(filePath, content);
    const found = this.findSymbolRecursive(symbols, word);
    if (found) {
      const preview = lines
        .slice(Math.max(0, found.line - 1), found.line + 2)
        .join("\n");
      return { file: filePath, line: found.line, preview };
    }
    return null;
  }

  private findSymbolRecursive(symbols: any[], name: string): any {
    for (const s of symbols) {
      if (s.name === name) return s;
      if (s.children) {
        const found = this.findSymbolRecursive(s.children, name);
        if (found) return found;
      }
    }
    return null;
  }

  async getSymbolInfo(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const def = await this.findDefinition(filePath, content, line, character);
    if (def && def.preview) {
      return `Definition:\n${def.preview}`;
    }
    return null;
  }

  async findImplementation(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    return []; // Not implemented for TreeSitter yet
  }

  async findReferences() {
    return [];
  }

  async getDocumentSymbols(filePath: string, content: string) {
    if (!this.parser || !this.lang) return [];
    const tree = this.parser.parse(content);

    let queryScm = "";
    if (this.languageName === "python") {
      queryScm = `
        (function_definition name: (identifier) @name) @def
        (class_definition name: (identifier) @name) @def
      `;
    }

    try {
      const query = this.lang.query(queryScm);
      const matches = query.matches(tree.rootNode);

      return matches.map((m: any) => {
        const nameNode = m.captures.find((c: any) => c.name === "name")?.node;
        const defNode = m.captures.find((c: any) => c.name === "def")?.node;

        return {
          name: nameNode?.text || "anonymous",
          kind: defNode?.type.includes("class") ? "Class" : "Function",
          line: (defNode?.startPosition.row || 0) + 1,
        };
      });
    } catch {
      return [];
    }
  }
}

/**
 * ----------------------------------------------------------------------
 * TIER 3: Regex Provider (Fallback)
 * ----------------------------------------------------------------------
 */
class RegexProvider implements LanguageProvider {
  private config: Record<
    string,
    {
      defPattern: RegExp;
      kindMap: (match: RegExpMatchArray) => string;
      nameIdx: number;
      extensions: string[];
    }
  > = {
    python: {
      defPattern: /^\s*(?:async\s+)?(def|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm,
      kindMap: (m) => (m[1] === "class" ? "Class" : "Function"),
      nameIdx: 2,
      extensions: ["py"],
    },
    rust: {
      defPattern:
        /^\s*(?:pub\s+)?(fn|struct|enum|trait|impl)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm,
      kindMap: (m) => {
        const type = m[1] || "";
        return type.charAt(0).toUpperCase() + type.slice(1);
      },
      nameIdx: 2,
      extensions: ["rs"],
    },
    go: {
      defPattern: /^\s*func\s+(?:.*?\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\(/gm,
      kindMap: () => "Function",
      nameIdx: 1,
      extensions: ["go"],
    },
    default: {
      defPattern: /^\s*(function|class|interface)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm,
      kindMap: (m) => m[1] || "Unknown",
      nameIdx: 2,
      extensions: [],
    },
  };

  isSupported(ext: string): boolean {
    return true;
  }

  private getConfig(ext: string) {
    for (const key in this.config) {
      if (this.config[key]!.extensions.includes(ext)) {
        return this.config[key]!;
      }
    }
    return this.config.default!;
  }

  async getDiagnostics() {
    return { errors: [], warnings: [] };
  }

  async findDefinition(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const lines = content.split("\n");
    const docLine = lines[line - 1];
    if (!docLine) return null;

    // Extract word at cursor
    const match = docLine.slice(0, character).match(/[a-zA-Z0-9_]+$/);
    const suffix = docLine.slice(character).match(/^[a-zA-Z0-9_]+/);
    const word = (match ? match[0] : "") + (suffix ? suffix[0] : "");
    if (!word) return null;

    const ext = filePath.split(".").pop() || "";
    const cfg = this.getConfig(ext);

    for (let i = 0; i < lines.length; i++) {
      const lineContent = lines[i]!;
      if (lineContent.includes(word)) {
        const regex = new RegExp(cfg.defPattern.source, "gm");
        let match;
        while ((match = regex.exec(lineContent)) !== null) {
          if (match[cfg.nameIdx] === word) {
            const preview = lines.slice(Math.max(0, i - 1), i + 2).join("\n");
            return { file: filePath, line: i + 1, preview };
          }
        }
      }
    }

    return null;
  }

  async getSymbolInfo(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const def = await this.findDefinition(filePath, content, line, character);
    if (def) return `Defined at line ${def.line}`;
    return null;
  }

  async findImplementation() {
    return [];
  }

  async findReferences(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const lines = content.split("\n");
    const docLine = lines[line - 1];
    if (!docLine) return [];

    const match = docLine.slice(0, character).match(/[a-zA-Z0-9_]+$/);
    const suffix = docLine.slice(character).match(/^[a-zA-Z0-9_]+/);
    const word = (match ? match[0] : "") + (suffix ? suffix[0] : "");
    if (!word) return [];

    const refs: Array<{ file: string; line: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.includes(word)) {
        refs.push({ file: filePath, line: i + 1 });
      }
    }
    return refs;
  }

  async getDocumentSymbols(filePath: string, content: string) {
    const ext = filePath.split(".").pop() || "";
    const cfg = this.getConfig(ext);

    const symbols: any[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const regex = new RegExp(cfg.defPattern.source, "g");
      let match;
      while ((match = regex.exec(lines[i]!)) !== null) {
        symbols.push({
          name: match[cfg.nameIdx],
          kind: cfg.kindMap(match),
          line: i + 1,
        });
      }
    }

    return symbols;
  }
}

/**
 * ----------------------------------------------------------------------
 * CLIENT: Universal LSP Client
 * ----------------------------------------------------------------------
 */
export class UniversalLSPClient {
  private tsProvider: TypeScriptProvider;
  private pyProvider: TreeSitterProvider;
  private regexProvider: RegexProvider;

  constructor(private rootPath: string = process.cwd()) {
    this.tsProvider = new TypeScriptProvider(rootPath);
    this.regexProvider = new RegexProvider();

    const pythonWasm = path.resolve(
      rootPath,
      "parsers/tree-sitter-python.wasm",
    );
    this.pyProvider = new TreeSitterProvider("python", pythonWasm);
  }

  private async getProvider(filePath: string): Promise<LanguageProvider> {
    const ext = filePath.split(".").pop() || "";

    if (this.tsProvider.isSupported(ext)) {
      return this.tsProvider;
    }

    if (ext === "py" && this.pyProvider.isSupported(ext)) {
      return this.pyProvider;
    }

    return this.regexProvider;
  }

  async getDiagnostics(filePath: string, content: string) {
    const provider = await this.getProvider(filePath);
    return provider.getDiagnostics(filePath, content);
  }

  async findDefinition(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const provider = await this.getProvider(filePath);
    return provider.findDefinition(filePath, content, line, character);
  }

  async findReferences(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const provider = await this.getProvider(filePath);
    return provider.findReferences(filePath, content, line, character);
  }

  async getDocumentSymbols(filePath: string, content: string) {
    const provider = await this.getProvider(filePath);
    return provider.getDocumentSymbols(filePath, content);
  }

  async getSymbolInfo(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const provider = await this.getProvider(filePath);
    return provider.getSymbolInfo(filePath, content, line, character);
  }

  async findImplementation(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const provider = await this.getProvider(filePath);
    return provider.findImplementation(filePath, content, line, character);
  }

  async prepareCallHierarchy(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const provider = await this.getProvider(filePath);
    return provider.prepareCallHierarchy
      ? provider.prepareCallHierarchy(filePath, content, line, character)
      : [];
  }

  async getIncomingCalls(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const provider = await this.getProvider(filePath);
    return provider.getIncomingCalls
      ? provider.getIncomingCalls(filePath, content, line, character)
      : [];
  }

  async getOutgoingCalls(
    filePath: string,
    content: string,
    line: number,
    character: number,
  ) {
    const provider = await this.getProvider(filePath);
    return provider.getOutgoingCalls
      ? provider.getOutgoingCalls(filePath, content, line, character)
      : [];
  }

  async searchWorkspaceSymbols(query: string, filePath: string) {
    const provider = await this.getProvider(filePath);
    return provider.searchWorkspaceSymbols
      ? provider.searchWorkspaceSymbols(query)
      : [];
  }

  isSupported(filePath: string): boolean {
    return true;
  }

  getSupportedExtensions(): string[] {
    return ["ts", "js", "py", "rs", "go", "*"];
  }

  shutdown() {
    // No-op
  }
}

let clientInstance: UniversalLSPClient | null = null;

export function getLSPClient(rootPath?: string): UniversalLSPClient {
  if (!clientInstance) {
    clientInstance = new UniversalLSPClient(rootPath);
  }
  return clientInstance;
}

export function resetLSPClient(): void {
  clientInstance = null;
}

export default UniversalLSPClient;
