import type { AgentStateType } from "../../types/state";
import QdrantCli from "../../services/qdrant";

export const createSearchQdrantNode = (
  qdrant: QdrantCli,
  updateOutput: (type: "log", content: string) => void
) => {
  return async (state: AgentStateType) => {
    updateOutput("log", "🔍 [STEP 1/4] Searching Qdrant vector database...");

    const searchResults = await qdrant.hybridSearch(
      state.repoName,
      state.query
    );

    const filePaths: string[] = [];
    if (searchResults) {
      for (const res of searchResults as any[]) {
        const filePath = res.payload.filePath;
        if (filePath && !filePaths.includes(filePath)) {
          filePaths.push(filePath);
        }
      }
    }

    updateOutput("log", `Found ${filePaths.length} relevant files.`);

    return {
      qdrantResults: searchResults || [],
      filePaths,
      status: "qdrant_search_complete",
    };
  };
};
