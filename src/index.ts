import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./server.js";
import {
  initStorage,
  closeDb,
  setActiveProject,
  getActiveOrMostRecentProject,
  getMemoriesByProject,
  getProjectMemoryCount,
  updateProjectSession,
} from "./engine/storage.js";
import { getOrCreateProject } from "./engine/project.js";
import { loadConfig } from "./utils/config.js";
import { logger } from "./utils/logger.js";
import type { Config } from "./types/index.js";

function resolveProjectPath(): string | null {
  // Priority: CLI arg > env var > cwd
  const args = process.argv.slice(2);
  const pathArgIndex = args.indexOf("--project-path");
  if (pathArgIndex !== -1 && args[pathArgIndex + 1]) {
    return args[pathArgIndex + 1];
  }

  if (process.env.SHACKLEAI_PROJECT_PATH) {
    return process.env.SHACKLEAI_PROJECT_PATH;
  }

  // Use cwd — MCP clients typically launch servers from the workspace directory
  const cwd = process.cwd();
  // Don't auto-init for system directories
  if (cwd === "/" || cwd === "C:\\" || cwd.toLowerCase() === process.env.HOME?.toLowerCase()) {
    return null;
  }

  return cwd;
}

function autoInit(config: Config): void {
  const projectPath = resolveProjectPath();
  if (!projectPath) {
    logger.info("No project path detected — waiting for memory_init call");
    return;
  }

  try {
    const project = getOrCreateProject(projectPath);
    setActiveProject(project.id);
    updateProjectSession(project.id);
    logger.info(`Auto-initialized project: ${project.name} (${projectPath})`);
  } catch (err) {
    logger.warn("Auto-init failed (non-fatal):", err);
  }
}

function registerResources(server: McpServer) {
  // Static resource: current project context (conventions, decisions, bugs, todos)
  server.resource("project-context", "memory://project/context", async (uri) => {
    const project = getActiveOrMostRecentProject();
    if (!project) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: "No project initialized yet. The memory server will auto-detect your project, or call memory_init with your project path.",
          },
        ],
      };
    }

    const conventions = getMemoriesByProject(project.id, "convention").slice(0, 10);
    const decisions = getMemoriesByProject(project.id, "decision").slice(0, 10);
    const bugs = getMemoriesByProject(project.id, "bug").slice(0, 5);
    const todos = getMemoriesByProject(project.id, "todo").slice(0, 5);
    const architecture = getMemoriesByProject(project.id, "architecture").slice(0, 5);
    const memoryCount = getProjectMemoryCount(project.id);

    const sections = [
      `# Project: ${project.name}`,
      project.tech_stack ? `**Tech stack**: ${project.tech_stack}` : null,
      `**Total memories**: ${memoryCount}`,
      "",
      conventions.length > 0
        ? `## Conventions\n${conventions.map((c) => `- ${c.content}`).join("\n")}`
        : null,
      decisions.length > 0
        ? `## Decisions\n${decisions.map((d) => `- ${d.content}`).join("\n")}`
        : null,
      architecture.length > 0
        ? `## Architecture\n${architecture.map((a) => `- ${a.content}`).join("\n")}`
        : null,
      bugs.length > 0 ? `## Known Bugs\n${bugs.map((b) => `- ${b.content}`).join("\n")}` : null,
      todos.length > 0
        ? `## Open Items\n${todos.map((t) => `- ${t.content}`).join("\n")}`
        : null,
    ];

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: sections.filter(Boolean).join("\n\n"),
        },
      ],
    };
  });
}

async function main() {
  const config = await loadConfig();
  await initStorage(config);

  // Auto-detect and initialize project from cwd/env/CLI arg
  autoInit(config);

  const server = new McpServer({
    name: "shackleai-memory",
    version: "0.3.0",
  });

  registerTools(server, config);
  registerResources(server);

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
