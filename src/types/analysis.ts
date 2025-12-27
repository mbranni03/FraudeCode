export interface GitRepo {
  path: string;
  subPath?: string;
  name: string;
}

export interface Chunk {
  id: string;
  document: string;
  startLine: number;
  endLine: number;
  parent?: string;
  symbol?: string;
  filePath?: string;
  language?: string;
}

export interface FileAnalysis {
  chunks: Chunk[];
  imports: ImportInfo[];
  definitions: DefinitionInfo[];
  calls: CallInfo[];
}

export interface ImportInfo {
  module: string;
  alias?: string;
}

export interface DefinitionInfo {
  type: "function" | "class";
  name: string;
  startLine: number;
  parentName?: string;
}

export interface CallInfo {
  sourceContext: string | undefined;
  functionName: string;
}
