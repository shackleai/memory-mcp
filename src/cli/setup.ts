import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const MCP_CONFIG_FILE = ".mcp.json";

const MEMORY_SERVER_CONFIG = {
  command: "npx",
  args: ["-y", "@shackleai/memory-mcp"],
};

export function runSetup(): void {
  const cwd = process.cwd();
  const configPath = join(cwd, MCP_CONFIG_FILE);

  let config: Record<string, unknown> = {};
  let existed = false;

  if (existsSync(configPath)) {
    existed = true;
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      console.error(`Error: ${MCP_CONFIG_FILE} exists but is not valid JSON.`);
      process.exit(1);
    }
  }

  // Ensure mcpServers key exists
  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }

  const servers = config.mcpServers as Record<string, unknown>;

  if (servers.memory) {
    console.log(`\u2713 memory server already configured in ${MCP_CONFIG_FILE}`);
  } else {
    servers.memory = MEMORY_SERVER_CONFIG;
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log(existed ? `\u2713 Added memory server to existing ${MCP_CONFIG_FILE}` : `\u2713 Created ${MCP_CONFIG_FILE} with memory server`);
  }

  console.log(`\nYou're all set! Start your AI tool in this directory and memory will be active.\n`);
  console.log("  Claude Code:  claude");
  console.log("  Cursor:       Open this folder in Cursor");
  console.log("  VS Code:      Open this folder in VS Code\n");
  console.log("First run downloads the embedding model (~80MB, one-time). After that, everything works offline.");
}
