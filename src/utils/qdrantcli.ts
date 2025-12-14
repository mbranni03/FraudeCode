import { QdrantClient } from "@qdrant/js-client-rest";

// Embedding Models
// bge-m3: Known for multi-functionality, multi-linguality (100+ languages), and multi-granularity (up to 8192 tokens).
// mxbai-embed-large: An excellent all-around performer that often matches or outperforms proprietary models on benchmarks.
// nomic-embed-text: A strong model, particularly for long-context tasks, with a large token context window.
// embeddinggemma: A lightweight and efficient model from Google, suitable for resource-constrained environments.

class QdrantCli {
  client: QdrantClient;

  constructor() {
    this.client = new QdrantClient({
      url: "http://localhost:6333",
    });
  }

  async getOrCreateCollection(name: string) {
    try {
      // Try to fetch first (cheap + fast)
      await this.client.getCollection(name);
      return { created: false };
    } catch (err: any) {
      // Only create if it truly does not exist
      if (err?.status === 404) {
        await this.client.createCollection(name, {
          vectors: {
            size: 1024,
            distance: "Cosine",
          },
        });
        return { created: true };
      }

      throw err;
    }
  }

  async upsertCollections(collectionName: string, points: any[]) {
    console.log("Upserting");
    console.log(points);
    await this.client.upsert(collectionName, {
      wait: true, // optional: wait for operation to complete
      points: points,
    });
  }

  async searchCollections(collectionName: string, query: any) {
    return await this.client.query(collectionName, {
      query: query,
      limit: 3,
      with_payload: true,
    });
  }
}

export default QdrantCli;
