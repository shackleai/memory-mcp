import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const MCP_CONFIG_FILE = ".mcp.json";

const MEMORY_SERVER_CONFIG = {
  command: "npx",
  args: ["-y", "@shackleai/memory-mcp"],
};

const MEMORY_INSTRUCTIONS = `## Memory

This project uses ShackleAI Memory (MCP) for persistent context across sessions.

You MUST do all three of these every session:
1. **Session start**: Call memory_search to load prior context about this project
2. **During work**: Call memory_store for every file you create/modify, every decision you make, every convention you follow — minimum one memory_store call per task
3. **Session end**: Call memory_session_end with a summary of what was accomplished
`;

function isOutdatedConfig(existing: Record<string, unknown>): boolean {
  // Local path configs (node dist/index.js) should be upgraded to npx
  if (existing.command === "node") return true;
  // Old configs missing -y flag
  const args = existing.args as string[] | undefined;
  if (existing.command === "npx" && args && !args.includes("-y")) return true;
  return false;
}

function setupMcpConfig(cwd: string): void {
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

  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }

  const servers = config.mcpServers as Record<string, unknown>;
  const existing = servers.memory as Record<string, unknown> | undefined;

  const needsUpdate = !existing || isOutdatedConfig(existing);

  if (needsUpdate) {
    const wasUpgrade = !!existing;
    servers.memory = MEMORY_SERVER_CONFIG;
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    if (wasUpgrade) {
      console.log(`\u2713 Upgraded memory server config in ${MCP_CONFIG_FILE}`);
    } else if (existed) {
      console.log(`\u2713 Added memory server to existing ${MCP_CONFIG_FILE}`);
    } else {
      console.log(`\u2713 Created ${MCP_CONFIG_FILE} with memory server`);
    }
  } else {
    console.log(`\u2713 memory server already configured in ${MCP_CONFIG_FILE}`);
  }
}

function setupClaudeMd(cwd: string): void {
  const claudeMdPath = join(cwd, "CLAUDE.md");

  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, "utf-8");
    if (content.includes("ShackleAI Memory")) {
      console.log("\u2713 CLAUDE.md already has memory instructions");
      return;
    }
    // Append to existing CLAUDE.md
    writeFileSync(claudeMdPath, content.trimEnd() + "\n\n" + MEMORY_INSTRUCTIONS);
    console.log("\u2713 Added memory instructions to existing CLAUDE.md");
  } else {
    writeFileSync(claudeMdPath, MEMORY_INSTRUCTIONS);
    console.log("\u2713 Created CLAUDE.md with memory instructions");
  }
}

export function runSetup(): void {
  const cwd = process.cwd();

  setupMcpConfig(cwd);
  setupClaudeMd(cwd);

  console.log(`\nYou're all set! Start your AI tool in this directory and memory will be active.\n`);
  console.log("  Claude Code:  claude");
  console.log("  Cursor:       Open this folder in Cursor");
  console.log("  VS Code:      Open this folder in VS Code\n");
  console.log("First run downloads the embedding model (~80MB, one-time). After that, everything works offline.");
}
