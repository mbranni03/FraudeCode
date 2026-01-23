import { getLSPClient, resetLSPClient } from "./src/utils/lspClient";

/**
 * LSP Client Demo - All Operations
 */

async function main() {
  resetLSPClient();
  const client = getLSPClient(process.cwd());

  console.log("🤖 Universal LSP Client - Full Demo\n");
  console.log("Supported:", client.getSupportedExtensions().join(", "));
  console.log();

  const testFile = "src/agent/tools/lspTool.ts";
  const content = await Bun.file(testFile).text();

  // 1. ANALYZE (getDiagnostics)
  console.log("📋 1. ANALYZE (getDiagnostics)");
  console.log("─".repeat(50));
  const { errors, warnings } = await client.getDiagnostics(testFile, content);
  console.log(`  Errors: ${errors.length}, Warnings: ${warnings.length}`);
  if (errors.length > 0) console.log(`  First: ${errors[0]?.slice(0, 60)}...`);
  console.log();

  // 2. LOOKUP (findDefinition)
  console.log("🔍 2. LOOKUP (findDefinition) - 'pendingChanges'");
  console.log("─".repeat(50));
  const def = await client.findDefinition(testFile, content, 4, 8);
  if (def) {
    console.log(`  Defined in: ${def.file.replace(process.cwd(), "")}`);
    console.log(`  Line: ${def.line}`);
  }
  console.log();

  // 3. INFO (getSymbolInfo / hover)
  console.log("📖 3. INFO (hover) - 'tool'");
  console.log("─".repeat(50));
  const info = await client.getSymbolInfo(testFile, content, 1, 10);
  if (info) console.log(`  ${info.split("\n").slice(0, 3).join("\n  ")}`);
  console.log();

  // 4. REFERENCES (findReferences)
  console.log("🔗 4. REFERENCES (findReferences) - 'content' at line 94");
  console.log("─".repeat(50));
  const refs = await client.findReferences(testFile, content, 94, 11);
  console.log(`  Found ${refs.length} references:`);
  refs.slice(0, 5).forEach((r) => {
    console.log(`    Line ${r.line}`);
  });
  if (refs.length > 5) console.log(`    ... and ${refs.length - 5} more`);
  console.log();

  // 5. DOCUMENT SYMBOLS
  console.log("📑 5. DOCUMENT SYMBOLS (getDocumentSymbols)");
  console.log("─".repeat(50));
  const symbols = await client.getDocumentSymbols(testFile, content);
  console.log(`  Found ${symbols.length} top-level symbols:`);
  symbols.slice(0, 5).forEach((s) => {
    console.log(`    ${s.kind} ${s.name} (line ${s.line})`);
  });
  if (symbols.length > 5) console.log(`    ... and ${symbols.length - 5} more`);
  console.log();

  // 6. WORKSPACE SYMBOLS
  console.log("🔎 6. WORKSPACE SYMBOLS (searchWorkspaceSymbols) - 'Agent'");
  console.log("─".repeat(50));
  const wsSymbols = await client.searchWorkspaceSymbols("Agent", testFile);
  console.log(`  Found ${wsSymbols.length} matching symbols:`);
  wsSymbols.slice(0, 5).forEach((s) => {
    console.log(
      `    ${s.kind} ${s.name} - ${s.file.replace(process.cwd(), "")}:${s.line}`,
    );
  });
  if (wsSymbols.length > 5)
    console.log(`    ... and ${wsSymbols.length - 5} more`);
  console.log();

  // 7. IMPLEMENTATION (findImplementation)
  console.log("🏗️ 7. IMPLEMENTATION (findImplementation) - 'execute'");
  console.log("─".repeat(50));
  const impls = await client.findImplementation(testFile, content, 89, 3);
  console.log(`  Found ${impls.length} implementations`);
  impls.slice(0, 3).forEach((impl) => {
    console.log(`    ${impl.file.replace(process.cwd(), "")}:${impl.line}`);
  });
  console.log();

  // 8. CALL HIERARCHY (prepareCallHierarchy)
  console.log(
    "📞 8. CALL HIERARCHY (prepareCallHierarchy) - 'findSymbolPosition'",
  );
  console.log("─".repeat(50));
  // Find where findSymbolPosition is defined
  const callHierarchy = await client.prepareCallHierarchy(
    testFile,
    content,
    12,
    10,
  );
  console.log(`  Found ${callHierarchy.length} items:`);
  callHierarchy.forEach((item) => {
    console.log(`    ${item.kind} ${item.name}`);
  });
  console.log();

  // 9. INCOMING CALLS (getIncomingCalls)
  console.log("📥 9. INCOMING CALLS (getIncomingCalls) - 'findSymbolPosition'");
  console.log("─".repeat(50));
  const incoming = await client.getIncomingCalls(testFile, content, 12, 10);
  console.log(`  Found ${incoming.length} callers:`);
  incoming.slice(0, 5).forEach((call) => {
    console.log(`    ${call.name} - line ${call.line}`);
  });
  console.log();

  // 10. OUTGOING CALLS (getOutgoingCalls)
  console.log(
    "📤 10. OUTGOING CALLS (getOutgoingCalls) - 'findSymbolPosition'",
  );
  console.log("─".repeat(50));
  const outgoing = await client.getOutgoingCalls(testFile, content, 12, 10);
  console.log(`  Found ${outgoing.length} called functions:`);
  outgoing.slice(0, 5).forEach((call) => {
    console.log(`    ${call.name} - line ${call.line}`);
  });

  console.log("\n✅ All 10 LSP operations tested!");
  await client.shutdown();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
