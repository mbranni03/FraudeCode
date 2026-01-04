import QdrantCli from "../src/services/qdrant";
import Neo4jClient from "../src/services/neo4j";
import CodeAnalyzer from "../src/utils/CodeAnalyzer";

(async () => {
  let repo = {
    path: "/Users/mbranni03/Documents/GitHub/FraudeCode/sample",
    name: "sample",
  };
  await Neo4jClient.healthCheck();
  await Neo4jClient.deleteAllNodes();
  await QdrantCli.init();
  await QdrantCli.deleteCollection(repo.name);
  await QdrantCli.getOrCreateCollection(repo.name);
  await new CodeAnalyzer().indexAllFiles(repo, QdrantCli, Neo4jClient);
  console.log("Indexing finished.");
  await Neo4jClient.close();
})();
