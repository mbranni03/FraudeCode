#!/usr/bin/env bun
/**
 * Database initialization script
 * Run: bun run plugins/learn/db/init.ts
 */

import { join, dirname } from "path";
import { KnowledgeGraph } from "./knowledge-graph";

const DB_PATH = join(dirname(import.meta.path), "..", "learning.db");
const RUST_JSON_PATH = join(dirname(import.meta.path), "..", "kg", "rust.json");

async function main() {
  console.log("🚀 Initializing Rust Learning Knowledge Graph...\n");

  // Create knowledge graph instance (initializes schema)
  const kg = new KnowledgeGraph(DB_PATH);
  console.log(`📁 Database: ${DB_PATH}`);

  // Seed from JSON
  kg.seedFromJson(RUST_JSON_PATH);

  // Show some stats
  const concepts = kg.getAllConcepts();
  console.log(`\n📊 Knowledge Graph Stats:`);
  console.log(`   Total concepts: ${concepts.length}`);

  // Group by category
  const categories = new Map<string, number>();
  for (const c of concepts) {
    const cat = c.category || "uncategorized";
    categories.set(cat, (categories.get(cat) || 0) + 1);
  }

  console.log(`   Categories:`);
  for (const [cat, count] of categories) {
    console.log(`     - ${cat}: ${count}`);
  }

  // Show frontier for new user
  console.log(`\n🎯 Initial frontier for a new user:`);
  const frontier = kg.getFrontier("test_user");
  for (const lesson of frontier.slice(0, 3)) {
    console.log(
      `   - ${lesson.label} (${lesson.category}, complexity: ${lesson.complexity})`,
    );
  }

  kg.close();
  console.log("\n✅ Database initialized successfully!");
}

main().catch(console.error);
