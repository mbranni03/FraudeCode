import command from "./index";

console.log("Starting informed plugin standalone server...");
command.action().catch((err) => {
  console.error("Error starting server:", err);
  process.exit(1);
});
