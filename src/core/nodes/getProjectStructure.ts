import type Neo4jClient from "../../services/neo4j";
import type { AgentStateType } from "../../types/state";

export const createGetProjectStructureNode = (
  neo4j: Neo4jClient,
  updateOutput: (type: "log", content: string) => void
) => {
  return async (state: AgentStateType) => {
    updateOutput("log", "Fetching project structure...");
    const session = neo4j.driver.session();
    let structureData = "";
    try {
      const result = await session.run(
        `
              MATCH (f:File)-[d:DEFINES]->(child)
              WHERE f.path STARTS WITH $repoName
              RETURN f.path as filePath, labels(child)[0] as type, child.name as name
              ORDER BY filePath, type
          `,
        { repoName: state.repoName }
      );

      const fileMap: Record<string, string[]> = {};
      result.records.forEach((r) => {
        const path = r.get("filePath");
        const type = r.get("type");
        const name = r.get("name");
        if (!fileMap[path]) fileMap[path] = [];
        fileMap[path].push(`${type}: ${name}`);
      });

      for (const [path, items] of Object.entries(fileMap)) {
        structureData +=
          `File: ${path}\n` + items.map((i) => `  - ${i}`).join("\n") + "\n\n";
      }
    } finally {
      await session.close();
    }

    return {
      status: "completed",
      structuralContext: structureData,
    };
  };
};
