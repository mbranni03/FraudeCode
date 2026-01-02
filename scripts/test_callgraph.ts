import { Neo4jClient } from "../src/services/neo4j";

async function testCallGraph() {
  const neo4jClient = new Neo4jClient();

  try {
    await neo4jClient.healthCheck();

    console.log("\n=== Testing getGraphForFilePaths ===\n");

    // Test with main.py and utils.py
    const filePaths = ["main.py", "utils.py"];
    const graph = await neo4jClient.getGraphForFilePaths(filePaths);

    console.log(`Found ${graph.length} symbols in files:`, filePaths);

    // Group and display by file
    const byFile: Record<string, any[]> = {};
    for (const node of graph) {
      if (!byFile[node.filePath]) {
        byFile[node.filePath] = [];
      }
      byFile[node.filePath].push(node);
    }

    for (const [file, nodes] of Object.entries(byFile)) {
      console.log(`\n--- ${file} ---`);
      for (const node of nodes) {
        console.log(
          `Symbol info for "${node.name}":`,
          JSON.stringify([node], null, 2)
        );
      }
    }

    console.log("\n=== Testing individual symbol lookup ===\n");
    const calculateInfo = await neo4jClient.getContextBySymbol("calculate");
    console.log(
      `Symbol info for "calculate":`,
      JSON.stringify(calculateInfo, null, 2)
    );
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await neo4jClient.close();
  }
}

testCallGraph();
