import { Neo4jClient } from "../src/services/neo4j";

async function verifySignatures() {
  const neo4jClient = new Neo4jClient();
  await neo4jClient.healthCheck();

  // Get all functions and classes with their signatures
  const session = neo4jClient.driver.session();
  try {
    const result = await session.run(`
      MATCH (n)
      WHERE n:Function OR n:Class
      RETURN n.name as name, n.filePath as filePath, n.startLine as startLine, n.signature as signature, labels(n)[0] as type
      ORDER BY n.filePath, n.startLine
      LIMIT 10
    `);

    console.log("\n=== Functions and Classes with Signatures ===\n");
    result.records.forEach((record) => {
      const obj = record.toObject();
      console.log(
        `${obj.type}: ${obj.name} (${obj.filePath}:${obj.startLine})`
      );
      console.log(`Signature: ${obj.signature || "N/A"}`);
      console.log("---");
    });
  } finally {
    await session.close();
    await neo4jClient.close();
  }
}

verifySignatures();
