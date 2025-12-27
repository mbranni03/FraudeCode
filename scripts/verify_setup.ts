import QdrantCli from "../src/services/qdrant";
import Neo4jClient from "../src/services/neo4j";

(async () => {
  try {
    console.log("🔍 Starting System Verification...\n");

    // 1. Check Neo4j Connection
    console.log("1. Connecting to Neo4j...");
    const neo4j = new Neo4jClient();
    await neo4j.healthCheck();

    // 2. Check Qdrant Connection
    console.log("\n2. Connecting to Qdrant and testing embedding...");
    const qdrant = new QdrantCli();
    await qdrant.init();

    const testEmbedding = await qdrant.embed("FraudeCode system check");
    if (testEmbedding && testEmbedding.length > 0) {
      console.log(
        `   ✅ Qdrant & Ollama Responding! Embedding Dimension: ${testEmbedding.length}`
      );
    } else {
      throw new Error("Ollama returned empty embedding via QdrantCli");
    }

    // 3. Verify Collection Data
    console.log("\n3. Verifying 'sample' collection...");
    const collectionInfo = await qdrant.client.getCollection("sample");
    console.log(
      `   Collection 'sample' contains ${collectionInfo.points_count} items.`
    );

    if (collectionInfo.points_count && collectionInfo.points_count > 0) {
      console.log("\n4. Performing hybrid search test ('process data')...");
      const results = await qdrant.hybridSearch("sample", "process data");

      console.log("   --- Query Results ---");
      if (results.length > 0) {
        results.forEach((res: any, index: number) => {
          console.log(`   Result ${index + 1}:`);
          console.log(`     ID: ${res.id}`);
          console.log(`     File: ${res.payload.filePath || "unknown"}`);
          console.log(
            `     Snippet: "${(res.payload.code || res.payload.rawDocument)
              ?.substring(0, 50)
              .replace(/\n/g, " ")}..."`
          );
        });
        console.log("\n   ✅ Verification Successful!");
      } else {
        console.log("   ⚠️ No results found for query.");
      }
    } else {
      console.log(
        "\n   ⚠️ Collection is empty. Run 'scripts/analysis.ts' to index your code."
      );
    }
  } catch (e) {
    console.error("\n❌ Verification Failed:", e);
    process.exit(1);
  }
})();
