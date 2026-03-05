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
import { checkForUpdate, getVersionUpdateMessage } from "./engine/nudge.js";
import type { Config } from "./types/index.js";

// CLI subcommands — handle before starting MCP server
const subcommand = process.argv[2];
if (subcommand === "setup") {
  const { runSetup } = await import("./cli/setup.js");
  runSetup();
  process.exit(0);
}

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
  // Don't auto-init for system directories (Unix root, any Windows drive root like C:\, D:\, etc.)
  if (
    cwd === "/" ||
    /^[A-Z]:\\?$/i.test(cwd) ||
    cwd.toLowerCase() === process.env.HOME?.toLowerCase()
  ) {
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

function registerPrompts(server: McpServer) {
  server.prompt(
    "memory-guidelines",
    "How to use ShackleAI Memory effectively — trigger checklist and best practices",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `# ShackleAI Memory — Trigger Checklist

You MUST call memory_store immediately when any of these occur:

- Architectural decision made → category: "decision"
- Bug discovered or fixed → category: "bug"
- Convention established → category: "convention"
- User preference learned → category: "preference"
- TODO identified → category: "todo" (auto-gets status: "pending")
- Important project fact → category: "context"
- System design insight → category: "architecture"

## TODO Tracking
- memory_status: list todos by status, or update status (pending → in_progress → done)
- memory_cleanup: archive completed todos, delete stale low-importance memories

## Data Management
- memory_export: backup all project memories as JSON
- memory_import: restore or bootstrap from a backup

## Session Lifecycle
1. START: Call memory_search to load context
2. DURING: Call memory_store on every trigger above
3. END: Call memory_session_end with summary

Bias to action: if unsure whether to store — store it.`,
          },
        },
      ],
    }),
  );
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
    const allTodos = getMemoriesByProject(project.id, "todo");
    const todos = allTodos.filter((t) => t.status !== "done").slice(0, 5);
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
        ? `## Open Items\n${todos.map((t) => `- [${t.status || "pending"}] ${t.content}`).join("\n")}`
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

  const server = new McpServer(
    {
      name: "shackleai-memory",
      version: "0.4.1",
    },
    {
      instructions: `CRITICAL: You MUST follow these instructions for the ShackleAI Memory system. These are binding requirements, not suggestions.

SESSION START:
- Call memory_search with a query about the current task or project to load relevant context.
- If results are empty, call memory_list_projects to check project detection, then memory_init with the correct project path if needed.

DURING WORK — MANDATORY TRIGGERS:
When any of these events occur, you MUST call memory_store immediately:
- Architectural decision → category: "decision"
- Bug discovered or fixed → category: "bug"
- Convention established → category: "convention"
- User preference learned → category: "preference"
- TODO or incomplete work identified → category: "todo" (auto-gets status: "pending")
- Important project fact learned → category: "context"
- System design or structure insight → category: "architecture"

TODO TRACKING:
- When storing a todo, it gets status "pending" by default.
- Use memory_status to transition: pending → in_progress → done.
- Use memory_cleanup to archive completed todos and keep memory lean.

EXPORT/IMPORT:
- Use memory_export to backup all project memories as JSON.
- Use memory_import to restore or bootstrap from a backup.

Bias to action: If unsure whether to store — store it. False positives are cheap; lost context is expensive.

SESSION END:
- Call memory_session_end with a summary of what was accomplished and any open items. Do this before the conversation ends.

These memories persist across sessions and help you work faster. A memory stored today saves 5 minutes of re-discovery tomorrow.`,
    },
  );

  registerTools(server, config);
  registerResources(server);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // CRITICAL: Never console.log in stdio MCP servers — stdout is for protocol
  logger.info("Memory server started");

  // Non-blocking version check — runs in background, never delays startup
  checkForUpdate()
    .then((latestVersion) => {
      if (latestVersion) {
        logger.info(getVersionUpdateMessage(latestVersion));
      }
    })
    .catch(() => {
      // Silently ignore — offline or network issues are fine
    });

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
