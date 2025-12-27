import type Neo4jClient from "../../services/neo4j";
import type QdrantCli from "../../services/qdrant";

export default async function summarizeProject(
  neo4j: Neo4jClient,
  qdrant: QdrantCli,
  action: (payload: any) => Promise<void>
) {
  const repoName = "sample";

  // 1. Fetch Structure from Neo4j
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
      { repoName }
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

  // 2. Fetch some context from Qdrant
  console.log("Querying Qdrant for project context...");
  const searchResults = await qdrant.hybridSearch(
    repoName,
    "Overview of the project functions and classes"
  );

  let codeContext = "";
  if (searchResults && searchResults.length > 0) {
    searchResults.slice(0, 10).forEach((p: any) => {
      codeContext += `Snippet from ${p.payload.filePath} (symbol: ${p.payload.symbol}):\n${p.payload.rawDocument}\n---\n`;
    });
  }

  // 3. Synthesize summary
  const prompt = `
You are a senior software architect. Analyze the follow project structure and code snippets from the "${repoName}" project.
Then provide:
1. A brief overview of what the overall project can do.
2. A description of each file and its role in the project.
3. The overall project structure.

Project Structure:
${structureData}

Code Context:
${codeContext}

Full Response:
`;

  const payload = {
    messages: [{ role: "user", content: prompt }],
    options: { temperature: 0.6 },
  };

  await action(payload);
}
