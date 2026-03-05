import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { handleMemoryInit } from "./tools/memory-init.js";
import { handleMemoryStore } from "./tools/memory-store.js";
import { handleMemorySearch } from "./tools/memory-search.js";
import { handleMemoryUpdate } from "./tools/memory-update.js";
import { handleMemoryDelete } from "./tools/memory-delete.js";
import { handleMemoryList } from "./tools/memory-list.js";
import { handleSessionEnd } from "./tools/session-end.js";
import { handleMemoryStatus } from "./tools/memory-status.js";
import { handleMemoryExport } from "./tools/memory-export.js";
import { handleMemoryImport } from "./tools/memory-import.js";
import { handleMemoryCleanup } from "./tools/memory-cleanup.js";
import type { Config } from "./types/index.js";
import { logger } from "./utils/logger.js";

function errorResponse(toolName: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`${toolName} failed:`, err);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

export function registerTools(server: McpServer, config: Config) {
  server.tool(
    "memory_init",
    "Initialize project context. Auto-called on server startup — only call manually if switching projects mid-session. Returns conventions, recent decisions, open TODOs, and project metadata.",
    {
      project_path: z.string().min(1).describe("Absolute path to the project directory"),
      recent_messages: z
        .array(z.string())
        .optional()
        .describe("Recent conversation messages for context"),
    },
    async (params) => {
      try {
        return await handleMemoryInit(params, config);
      } catch (err) {
        return errorResponse("memory_init", err);
      }
    },
  );

  server.tool(
    "memory_store",
    "Save important information to persistent memory. ALWAYS use this when you: make an architectural decision, discover a bug or gotcha, establish a convention, learn a user preference, identify a TODO, or gain important project context. These memories persist across sessions and help future you work faster. MANDATORY — call this tool immediately when any trigger fires. Do not batch or defer. When in doubt, store it.",
    {
      content: z.string().min(1).describe("What to remember — be specific and concise"),
      category: z
        .enum([
          "decision",
          "convention",
          "bug",
          "architecture",
          "preference",
          "todo",
          "context",
          "session_summary",
        ])
        .describe("Category: decision (why we chose X), convention (always do Y), bug (gotcha/fix), architecture (how it's built), preference (user wants Z), todo (incomplete work), context (project facts)"),
      importance: z
        .enum(["low", "medium", "high"])
        .optional()
        .default("medium")
        .describe("high = critical to remember, medium = useful context, low = nice to know"),
      tags: z.array(z.string()).optional().describe("Tags for organization (e.g., ['auth', 'api', 'performance'])"),
      status: z
        .enum(["pending", "in_progress", "done"])
        .optional()
        .describe("Status for todo items (default: pending). Only used when category is 'todo'."),
    },
    async (params) => {
      try {
        return await handleMemoryStore(params, config);
      } catch (err) {
        return errorResponse("memory_store", err);
      }
    },
  );

  server.tool(
    "memory_search",
    "Search past memories by meaning. Use this BEFORE starting work to check if there's existing context about a topic. Also use when you're unsure about a convention, past decision, or known bug.",
    {
      query: z.string().min(1).describe("Natural language query — describe what you're looking for"),
      category: z
        .enum([
          "decision",
          "convention",
          "bug",
          "architecture",
          "preference",
          "todo",
          "context",
          "session_summary",
        ])
        .optional()
        .describe("Filter by category"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe("Max results to return"),
    },
    async (params) => {
      try {
        return await handleMemorySearch(params, config);
      } catch (err) {
        return errorResponse("memory_search", err);
      }
    },
  );

  server.tool(
    "memory_update",
    "Update an existing memory when information changes. Use when a decision is revised, a bug is fixed, or a convention evolves.",
    {
      id: z.string().min(1).describe("Memory ID to update"),
      content: z.string().min(1).describe("Updated content"),
      reason: z.string().optional().describe("Why the memory is being updated"),
    },
    async (params) => {
      try {
        return await handleMemoryUpdate(params, config);
      } catch (err) {
        return errorResponse("memory_update", err);
      }
    },
  );

  server.tool(
    "memory_delete",
    "Remove a memory that is no longer relevant or was stored incorrectly.",
    {
      id: z.string().min(1).describe("Memory ID to delete"),
    },
    async (params) => {
      try {
        return await handleMemoryDelete(params, config);
      } catch (err) {
        return errorResponse("memory_delete", err);
      }
    },
  );

  server.tool(
    "memory_list_projects",
    "List all projects that have stored memories, with memory counts and last session dates.",
    {},
    async () => {
      try {
        return await handleMemoryList(config);
      } catch (err) {
        return errorResponse("memory_list_projects", err);
      }
    },
  );

  server.tool(
    "memory_session_end",
    "Save a session summary before ending. Captures what was accomplished and what's left to do. This creates continuity — the next session picks up exactly where this one left off.",
    {
      summary: z.string().min(1).describe("What was accomplished in this session"),
      open_items: z.array(z.string()).optional().describe("Tasks or questions left incomplete"),
    },
    async (params) => {
      try {
        return await handleSessionEnd(params, config);
      } catch (err) {
        return errorResponse("memory_session_end", err);
      }
    },
  );

  // --- v0.4.0 New Tools ---

  server.tool(
    "memory_status",
    "Manage TODO status. Update a todo's status (pending → in_progress → done) or list todos by status. Essential for tracking work across sessions without external files.",
    {
      id: z.string().optional().describe("Memory ID to update status (omit to list)"),
      status: z
        .enum(["pending", "in_progress", "done"])
        .optional()
        .describe("New status to set"),
      list_status: z
        .enum(["pending", "in_progress", "done"])
        .optional()
        .describe("Filter todos by status (omit to list all)"),
    },
    async (params) => {
      try {
        return await handleMemoryStatus(params, config);
      } catch (err) {
        return errorResponse("memory_status", err);
      }
    },
  );

  server.tool(
    "memory_export",
    "Export all memories for the current project as JSON. Use for backup, migration, or sharing project context with team members.",
    {},
    async () => {
      try {
        return await handleMemoryExport(config);
      } catch (err) {
        return errorResponse("memory_export", err);
      }
    },
  );

  server.tool(
    "memory_import",
    "Import memories from a JSON array. Use to restore from backup, migrate between machines, or bootstrap a project with shared team context.",
    {
      memories: z
        .array(
          z.object({
            content: z.string().min(1),
            category: z.enum([
              "decision",
              "convention",
              "bug",
              "architecture",
              "preference",
              "todo",
              "context",
              "session_summary",
            ]),
            importance: z.enum(["low", "medium", "high"]).optional(),
            tags: z.array(z.string()).optional(),
            status: z.enum(["pending", "in_progress", "done"]).optional(),
            created_at: z.string().optional(),
          }),
        )
        .describe("Array of memories to import"),
    },
    async (params) => {
      try {
        return await handleMemoryImport(params, config);
      } catch (err) {
        return errorResponse("memory_import", err);
      }
    },
  );

  server.tool(
    "memory_cleanup",
    "Clean up stale memories. Archives completed TODOs and optionally removes old low-importance memories that haven't been accessed. Keeps the memory store lean and relevant.",
    {
      archive_done_todos: z
        .boolean()
        .optional()
        .default(true)
        .describe("Archive todos with status 'done' (default: true)"),
      delete_stale_days: z
        .number()
        .optional()
        .describe("Delete low-importance memories older than N days that have been accessed 0-1 times"),
      max_importance: z
        .enum(["low", "medium"])
        .optional()
        .describe("Maximum importance level to delete (default: low)"),
    },
    async (params) => {
      try {
        return await handleMemoryCleanup(params, config);
      } catch (err) {
        return errorResponse("memory_cleanup", err);
      }
    },
  );
}
