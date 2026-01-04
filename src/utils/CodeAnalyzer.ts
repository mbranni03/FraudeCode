import * as fs from "fs";
import path from "path";
import { Parser, Language, Node } from "web-tree-sitter";
import type {
  FileAnalysis,
  ImportInfo,
  DefinitionInfo,
  CallInfo,
  Chunk,
  GitRepo,
} from "../types/analysis";
import { split } from "../utils/Chunker";
import { walkRepo } from "../utils/FileScanner";
import { QdrantCli } from "../services/qdrant";
import { Neo4jClient } from "../services/neo4j";

const GRAMMAR_PATH = "./parsers/tree-sitter-python.wasm";

const pyConfig = {
  language: GRAMMAR_PATH,
  name: "python",
  wantedNodes: new Set(["function_definition", "class_definition"]),
};

export default class CodeAnalyzer {
  async reanalyzeFiles(
    repo: GitRepo,
    fileNames: string[],
    qdrantClient: QdrantCli,
    neo4jClient: Neo4jClient
  ) {
    for (const fileName of fileNames) {
      const absPath = path.join(repo.path, fileName);
      const relPath = path.relative(repo.path, absPath);

      // Clear existing data for this file
      await neo4jClient.deleteFileData(relPath);
      await qdrantClient.deleteFileChunks(repo.name, relPath);

      const fileAnalysis = await this.analyzeCode(absPath, relPath);
      await this.indexFile(
        fileAnalysis,
        relPath,
        absPath,
        repo,
        qdrantClient,
        neo4jClient
      );
    }
  }

  async analyzeCode(absPath: string, relPath: string): Promise<FileAnalysis> {
    await Parser.init();
    const parser = new Parser();
    const pythonLang = await Language.load(GRAMMAR_PATH);
    parser.setLanguage(pythonLang);

    const code = fs.readFileSync(absPath, "utf8");
    const tree = parser.parse(code);

    const chunks: any[] = [];
    const imports: ImportInfo[] = [];
    const definitions: DefinitionInfo[] = [];
    const calls: CallInfo[] = [];

    if (!tree) return { chunks, imports, definitions, calls };

    // --- Extract Imports ---
    const importNodes = this.collectTreeNodes(
      tree.rootNode,
      new Set(["import_statement", "import_from_statement"])
    );
    for (const node of importNodes) {
      if (node.type === "import_statement") {
        node.descendantsOfType("dotted_name").forEach((n) => {
          if (n && n.text) imports.push({ module: n.text });
        });
        node.descendantsOfType("aliased_import").forEach((n) => {
          if (n) {
            const mod = n.child(0)?.text;
            const alias = n.child(2)?.text;
            if (mod) imports.push({ module: mod, alias });
          }
        });
      } else if (node.type === "import_from_statement") {
        const moduleName = node.childForFieldName("module_name")?.text;
        if (moduleName) {
          imports.push({ module: moduleName });
        }
      }
    }

    // --- Extract Structure and Chunks ---
    const wantedNodes = this.collectTreeNodes(
      tree.rootNode,
      pyConfig.wantedNodes
    );
    wantedNodes.sort((a, b) => a.startIndex - b.startIndex);

    let cursor = 0;
    let line = tree.rootNode.startPosition.row + 1;

    for (const node of wantedNodes) {
      // 1. Definition Info
      const name = node.childForFieldName("name")?.text;
      if (name) {
        const parentDef = this.findWantedParent(node, pyConfig.wantedNodes);
        const parentName = parentDef
          ? parentDef.childForFieldName("name")?.text
          : undefined;

        // Extract signature (everything from start to body)
        const signature = this.extractSignature(node, code);

        definitions.push({
          type: node.type === "class_definition" ? "class" : "function",
          name: name,
          startLine: node.startPosition.row + 1,
          parentName,
          signature,
        });
      }

      // 2. Extract Calls within this definition
      const callNodes = this.collectTreeNodes(node, new Set(["call"]));
      for (const callNode of callNodes) {
        let funcName = callNode.childForFieldName("function")?.text;
        if (funcName) {
          calls.push({ sourceContext: name, functionName: funcName });
        }
      }

      // 3. Chunking
      if (cursor < node.startIndex) {
        const gap = code.slice(cursor, node.startIndex);
        const gapSplits = await split(gap, line);
        chunks.push(...gapSplits);
      }

      const parentNode = this.findWantedParent(node, pyConfig.wantedNodes);
      const parentSymbol = parentNode
        ? parentNode.childForFieldName("name")?.text
        : undefined;

      const nodeContent = code.slice(node.startIndex, node.endIndex);
      const nodeLine = node.startPosition.row;
      const nodeSplits = await split(nodeContent, nodeLine + 1);
      chunks.push(
        ...nodeSplits.map((n) => {
          return {
            ...n,
            symbol: name,
            parent: parentSymbol,
          };
        })
      );

      cursor = node.endIndex;
      line = node.endPosition.row + 1;
    }

    if (cursor < code.length) {
      const tail = code.slice(cursor);
      const tailSplits = await split(tail, line);
      chunks.push(...tailSplits);
    }

    // Top level calls
    const allCalls = this.collectTreeNodes(tree.rootNode, new Set(["call"]));
    for (const callNode of allCalls) {
      const parentDef = this.findWantedParent(callNode, pyConfig.wantedNodes);
      if (!parentDef) {
        let funcName = callNode.childForFieldName("function")?.text;
        if (funcName) {
          calls.push({ sourceContext: undefined, functionName: funcName });
        }
      }
    }

    return {
      chunks: chunks.map((chunk, i) => ({
        ...chunk,
        filePath: relPath,
        language: pyConfig.name,
      })),
      imports,
      definitions,
      calls,
    };
  }

  collectTreeNodes(node: Node, wantedNodes: Set<string>): Node[] {
    const treeNodes: Node[] = [];
    if (wantedNodes.has(node.type)) {
      treeNodes.push(node);
    }
    for (const child of node.children) {
      if (child === null) continue;
      treeNodes.push(...this.collectTreeNodes(child, wantedNodes));
    }
    return treeNodes;
  }

  findWantedParent(node: Node, wantedConfigs: Set<string>): Node | null {
    let curr = node.parent;
    while (curr) {
      if (wantedConfigs.has(curr.type)) {
        return curr;
      }
      curr = curr.parent;
    }
    return null;
  }

  extractSignature(node: Node, code: string): string {
    /**
     * Extracts the signature of a function or class definition.
     * Returns everything from the start of the definition up to the body.
     */
    // For both function_definition and class_definition,
    // get the body field which contains the actual implementation
    const bodyNode = node.childForFieldName("body");

    if (bodyNode) {
      // Extract from function/class start to the beginning of the body
      const signature = code.slice(node.startIndex, bodyNode.startIndex);
      return signature.trim();
    }

    // Fallback: return the entire node text if no body found
    return node.text.trim();
  }

  async addBatch(
    qdrantCli: QdrantCli,
    collectionName: string,
    chunks: Chunk[],
    batchSize: number = 100
  ) {
    console.log("Adding batch to Qdrant");
    const batch = chunks.slice(0, batchSize);
    const points = await Promise.all(
      batch.map(async (chunk) => {
        const { id, document, ...metadata } = chunk;
        const denseVector = await qdrantCli.embed(document);
        const sparseVector = qdrantCli.getSparseVector(document);
        return {
          id,
          vector: {
            "arctic-dense": denseVector,
            "code-sparse": sparseVector,
          },
          payload: { ...metadata, rawDocument: document },
        };
      })
    );
    await qdrantCli.upsertCollections(collectionName, points);
    return chunks.slice(batchSize);
  }

  async indexAllFiles(
    repo: GitRepo,
    client: QdrantCli,
    neo4jClient: Neo4jClient
  ) {
    await walkRepo(repo, async (filePath, absPath) => {
      if (!filePath.endsWith(".py")) return;

      // Create File Node
      await neo4jClient.addFileNode(filePath);

      const analysis = await this.analyzeCode(absPath, filePath);
      await this.indexFile(
        analysis,
        filePath,
        absPath,
        repo,
        client,
        neo4jClient
      );
    });
  }

  async indexFile(
    analysis: FileAnalysis,
    filePath: string,
    absPath: string,
    repo: GitRepo,
    client: QdrantCli,
    neo4jClient: Neo4jClient
  ) {
    console.log(
      `Processing ${filePath}: ${analysis.definitions.length} defs, ${analysis.calls.length} calls`
    );

    // Add Definitions (Functions/Classes)
    for (const def of analysis.definitions) {
      if (def.type === "function") {
        await neo4jClient.addFunctionNode(
          def.name,
          filePath,
          def.startLine,
          def.parentName,
          def.signature
        );
      } else {
        await neo4jClient.addClassNode(
          def.name,
          filePath,
          def.startLine,
          def.parentName,
          def.signature
        );
      }
    }

    // Add Imports
    for (const imp of analysis.imports) {
      await neo4jClient.addImportRelationship(filePath, imp.module);
    }

    // Add Calls
    for (const call of analysis.calls) {
      const parts = call.functionName.split(".");
      let targetFunc = call.functionName;
      let possibleFiles: string[] = [];

      if (parts.length > 1) {
        const prefix = parts[0];
        const lastPart = parts[parts.length - 1];
        if (lastPart) targetFunc = lastPart;

        if (prefix) {
          const imp = analysis.imports.find(
            (i: any) => i.alias === prefix || i.module === prefix
          );
          if (imp) {
            const currentDir = path.dirname(absPath);
            const candidateStr = imp.module.replace(/\./g, "/");
            const candidateSibling = path.join(
              currentDir,
              candidateStr + ".py"
            );
            if (fs.existsSync(candidateSibling)) {
              possibleFiles.push(path.relative(repo.path, candidateSibling));
            } else {
              possibleFiles.push(imp.module);
            }
          }
        }
      }

      await neo4jClient.addCallRelationship(
        filePath,
        call.sourceContext,
        targetFunc,
        possibleFiles
      );
    }

    // Add Chunks to Qdrant
    let chunks = analysis.chunks;
    while (chunks.length > 0) {
      chunks = await this.addBatch(client, repo.name, chunks);
    }
  }
}
