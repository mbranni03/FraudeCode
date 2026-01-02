import type { AgentStateType } from "../../types/state";
import { useFraudeStore } from "../../store/useFraudeStore";
import type { QdrantPayload } from "../../types/analysis";

const { updateOutput, setStatus } = useFraudeStore.getState();

const indexCode = (content: string, startingLine: number) => {
  const lines = content.split(/\r?\n/);
  const contentWithLineNumbers = lines
    .map((line, index) => `${index + startingLine}: ${line}`)
    .join("\n");
  return contentWithLineNumbers;
};

const organizePayloadsByFileAndLine = (searchResults: any[]) => {
  const files: Record<string, QdrantPayload[]> = {};

  for (const result of searchResults) {
    const payload: QdrantPayload = result.payload;
    if (!payload?.filePath) continue;

    if (!files[payload.filePath]) {
      files[payload.filePath] = [];
    }

    files[payload.filePath]?.push(payload);
  }

  // Sort each file's payloads by line number
  for (const filePath in files) {
    files[filePath]?.sort((a, b) => {
      if (a.startLine !== b.startLine) {
        return a.startLine - b.startLine;
      }
      return (a.endLine ?? a.startLine) - (b.endLine ?? b.startLine);
    });
  }

  return files;
};

export const createCombineContextNode = () => {
  return async (state: AgentStateType) => {
    setStatus("Combining context");

    const dependenciesList = state.structuralContext.map((s) => {
      const impacts = s.impactedCallers
        .filter((c: any) => c.name != null)
        .map((c: any) => `${c.file} -> ${c.name}`);
      const impactString =
        "\nIMPACTS: " +
        (impacts.length > 0 ? `[${impacts.join(", ")}]` : "NONE");
      return (
        "[DEPENDENCY]\n" +
        `NAME: ${s.name}\n` +
        `FILE: ${s.filePath}\n` +
        `SIGNATURE: ${s.signature}` +
        impactString
      );
    });
    const dependencies = dependenciesList.join("\n\n") + "\n\n";

    const organizedPayloads = organizePayloadsByFileAndLine(
      state.qdrantResults
    );
    const codeContext =
      Object.entries(organizedPayloads)
        .map(([filePath, payloads]) => {
          return (
            "FILE: " +
            filePath +
            "\n" +
            "CODE:\n" +
            payloads
              .map((p) => indexCode(p.rawDocument, p.startLine))
              .join("\n")
          );
        })
        .join("\n\n") + "\n\n";

    updateOutput("checkpoint", "Combined context");

    return {
      dependencies,
      codeContext,
      status: "context_gathered",
    };
  };
};
