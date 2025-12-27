import QdrantCli from "../src/services/qdrant";

(async () => {
  const qdrant = new QdrantCli();
  const text = "Bun + Ollama embeddings are fast";
  const embedding = await qdrant.embed(text);

  console.log("Embedding length:", embedding.length);
  console.log("First 5 values:", embedding.slice(0, 5));
})();
