import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./server.js";
import { initStorage, closeDb } from "./engine/storage.js";
import { loadConfig } from "./utils/config.js";
import { logger } from "./utils/logger.js";

async function main() {
  const config = await loadConfig();
  await initStorage(config);

  const server = new McpServer({
    name: "shackleai-memory",
    version: "0.2.1",
  });

  registerTools(server, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // CRITICAL: Never console.log in stdio MCP servers — stdout is for protocol
  logger.info("Memory server started");

  // Graceful shutdown — close SQLite cleanly (important for WAL mode)
  const shutdown = () => {
    logger.info("Shutting down...");
    closeDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Windows: SIGTERM doesn't fire — use 'exit' event as fallback for DB cleanup
  process.on("exit", () => {
    closeDb();
  });
}

// Catch unhandled promise rejections — log and exit cleanly
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled rejection:", err);
  closeDb();
  process.exit(1);
});

main().catch((err) => {
  logger.error("Fatal error:", err);
  closeDb();
  process.exit(1);
});
