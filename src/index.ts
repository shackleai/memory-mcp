import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./server.js";
import { initStorage } from "./engine/storage.js";
import { loadConfig } from "./utils/config.js";
import { logger } from "./utils/logger.js";

async function main() {
  const config = await loadConfig();
  await initStorage(config);

  const server = new McpServer({
    name: "shackleai-memory",
    version: "0.1.0",
  });

  registerTools(server, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // CRITICAL: Never console.log in stdio MCP servers — stdout is for protocol
  logger.info("Memory server started");
}

main().catch((err) => {
  logger.error("Fatal error:", err);
  process.exit(1);
});
